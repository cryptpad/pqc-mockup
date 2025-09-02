// SPDX-FileCopyrightText: 2025 XWiki CryptPad Team <contact@cryptpad.org> and Iulian-Tudor Scutaru
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import {getCryptoProvider, CRYPTO_SCHEMES, ENCRYPTOR_TYPES} from './cryptoProvider.js';

export class MultiRecipientCrypto {
    constructor(user, scheme = CRYPTO_SCHEMES.PQC, cryptoOptions = {}) {
        this.user = user;
        this.scheme = scheme;
        this.cryptoOptions = cryptoOptions;
        this.cryptoProvider = getCryptoProvider(scheme, cryptoOptions);
        this.initialized = false;
        this.initPromise = null;
        this.mailboxEncryptor = null;
        this.teamEncryptor = null;
        this.teamKeys = null;
    }

    // ========== Initialization Methods ==========

    async init() {
        if (this.initialized) return true;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise(async (resolve, reject) => {
            try {
                await this.cryptoProvider.init();
                this.initialized = true;
                resolve(true);
            } catch (error) {
                console.error(`[MultiRecipientCrypto] Failed to initialize provider:`, error);
                this.initPromise = null;
                reject(error);
            }
        });

        return this.initPromise;
    }

    async ensureInitialized() {
        if (!this.initialized) await this.init();
        return this.initialized;
    }

    // ========== Encryptor Management ==========

    async createMailboxEncryptor() {
        if (this.mailboxEncryptor) return this.mailboxEncryptor;

        const keys = {
            curvePublic: this.user.kemKeys.publicKey,
            curvePrivate: this.user.kemKeys.secretKey,
            signingKey: this.user.signKeys.secretKey,
            validateKey: this.user.signKeys.publicKey
        };

        this.mailboxEncryptor = await this.cryptoProvider.createMailboxEncryptor(keys);
        return this.mailboxEncryptor;
    }

    async createTeamEncryptor(teamKeys = null) {
        if (this.teamEncryptor && !teamKeys) return this.teamEncryptor;

        const keys = teamKeys || this.teamKeys || this.generateTeamKeys();

        if (!keys) {
            throw new Error('Failed to create team encryptor: no team keys available');
        }

        this.teamKeys = keys;
        console.log(`[MultiRecipientCrypto] Creating team encryptor with ${teamKeys ? 'provided' : 'generated'} team keys`);

        this.teamEncryptor = await this.cryptoProvider.createTeamEncryptor(keys);

        if (this.teamEncryptor.can_encrypt !== undefined) {
            console.log(`[MultiRecipientCrypto] Team encryptor can encrypt: ${this.teamEncryptor.can_encrypt}`);
        }
        
        if (this.teamEncryptor.can_decrypt !== undefined) {
            console.log(`[MultiRecipientCrypto] Team encryptor can decrypt: ${this.teamEncryptor.can_decrypt}`);
        }
        
        return this.teamEncryptor;
    }

    generateTeamKeys() {
        const keys = {
            teamCurvePublic: this.user.kemKeys.publicKey,
            teamCurvePrivate: this.user.kemKeys.secretKey,
            teamEdPublic: this.user.signKeys.publicKey,
            teamEdPrivate: this.user.signKeys.secretKey,
            myCurvePublic: this.user.kemKeys.publicKey,
            myCurvePrivate: this.user.kemKeys.secretKey
        };

        console.log('[MultiRecipientCrypto] Generated new team keys');
        return keys;
    }

    setTeamKeys(keys) {
        if (!keys) {
            console.warn('[MultiRecipientCrypto] Attempted to set null team keys');
            return;
        }

        this.teamKeys = keys;
        this.teamEncryptor = null; // Force recreation of the team encryptor
        console.log('[MultiRecipientCrypto] Team keys set, encryptor will be recreated');
    }

    // ========== Helper Methods ==========

    _createStats(startTime, operation = 'encrypt', sizes = {}) {
        const totalTime = performance.now() - startTime;
        let stats = { totalTime };
        
        if (operation === 'encrypt') {
            stats = {
                ...stats,
                encryptTime: totalTime * 0.7,
                signTime: totalTime * 0.3,
                decryptTime: 0,
                verifyTime: 0,
                encryptedSize: sizes.encryptedSize || 0,
                signatureSize: sizes.signatureSize || 0
            };
        } else {
            stats = {
                ...stats,
                encryptTime: 0,
                signTime: 0,
                decryptTime: totalTime * 0.7,
                verifyTime: totalTime * 0.3
            };
        }

        this.user.stats.push(stats);
        return stats;
    }

    async _normalizeDataToString(data) {
        if (typeof data === 'string') return data;
        if (data instanceof Uint8Array) return await this.cryptoProvider.bytesToText(data);
        return JSON.stringify(data);
    }


    _estimateSize(data) {
        if (!data) return 0;
        
        if (typeof data === 'string') {
            if (/^[A-Za-z0-9+/=]+$/.test(data)) {
                const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
                return Math.floor((data.length * 3) / 4) - padding;
            }
            return data.length;
        }
        
        if (data instanceof Uint8Array) {
            return data.length;
        }
        
        if (typeof data === 'object') {
            return JSON.stringify(data).length;
        }
        
        return 0;
    }

    _trackMessageSizes(sizes) {
        if (!this.user.messageSizes) {
            this.user.messageSizes = [];
        }
        this.user.messageSizes.push(sizes);
    }

    // ========== Encryption Methods ==========

    async encryptForTeam(data) {
        if (!this.teamKeys) {
            console.log('[MultiRecipientCrypto] No team keys found, generating new ones');
            this.teamKeys = this.generateTeamKeys();
        }

        const encryptor = await this.createTeamEncryptor(this.teamKeys);
        
        // Check if encryptor can encrypt
        if (encryptor.can_encrypt === false) {
            throw new Error('Team encryptor does not have encryption capability with current keys');
        }

        const encrypted = await encryptor.encrypt(data);
        if (!encrypted) {
            throw new Error('Team encryption failed to produce output');
        }

        return encrypted;
    }

    async encryptForMailbox(data, recipientPublicKeys) {
        const encryptor = await this.createMailboxEncryptor();
        const encryptedVersions = {};

        for (const recipientKey of recipientPublicKeys) {
            try {
                const message = await encryptor.encrypt(data, recipientKey);
                encryptedVersions[recipientKey] = message;

                if (typeof message === 'object') {
                    const encryptedSize = this._estimateSize(message.encryptedData || message);
                    const signatureSize = this._estimateSize(message.signature);
                    
                    this._trackMessageSizes({
                        encryptedSize,
                        signatureSize
                    });
                } else {
                    const totalSize = this._estimateSize(message);
                    this._trackMessageSizes({
                        encryptedSize: totalSize
                    });
                }
            } catch (err) {
                console.error(`[MultiRecipientCrypto] Failed to encrypt for recipient ${recipientKey.slice(-8)}:`, err);
            }
        }

        return encryptedVersions;
    }

    async encryptForMultipleRecipients(data, recipientPublicKeys, encryptorType = ENCRYPTOR_TYPES.MAILBOX) {
        await this.ensureInitialized();
        const startTime = performance.now();
        const dataString = await this._normalizeDataToString(data);
        let sizes = {};

        try {
            if (encryptorType === ENCRYPTOR_TYPES.TEAM) {
                console.log('[MultiRecipientCrypto] Using TEAM encryptor for message');
                const teamEncrypted = await this.encryptForTeam(dataString);

                if (teamEncrypted) {
                    sizes = {
                        encryptedSize: this._estimateSize(teamEncrypted.outerBundle?.encryptedData),
                        signatureSize: this._estimateSize(teamEncrypted.signature)
                    };
                }
                
                return {
                    teamEncrypted,
                    stats: this._createStats(startTime, 'encrypt', sizes)
                };
            } else {
                console.log('[MultiRecipientCrypto] Using MAILBOX encryptor for message');
                const encryptedVersions = await this.encryptForMailbox(dataString, recipientPublicKeys);

                if (this.user.messageSizes?.length > 0) {
                    const lastMsg = this.user.messageSizes[this.user.messageSizes.length - 1];
                    sizes = {
                        encryptedSize: lastMsg.encryptedSize || 0,
                        signatureSize: lastMsg.signatureSize || 0
                    };
                }
                
                return {
                    encryptedVersions,
                    stats: this._createStats(startTime, 'encrypt', sizes)
                };
            }
        } catch (err) {
            console.error(`[MultiRecipientCrypto] Encryption failed for ${encryptorType}:`, err);
            throw err;
        }
    }

    async createSharedBlock(data, recipientPublicKeys, encryptorType = ENCRYPTOR_TYPES.MAILBOX) {
        await this.ensureInitialized();
        console.log(`[MultiRecipientCrypto] Creating shared block with encryptor type: ${encryptorType}`);

        if (encryptorType === ENCRYPTOR_TYPES.TEAM && !this.teamKeys) {
            console.log('[MultiRecipientCrypto] Team encryption requested but no keys set, generating keys');
            this.teamKeys = this.generateTeamKeys();
        }

        const originalData = data;
        const dataString = await this._normalizeDataToString(data);

        const baseBlock = {
            userId: this.user.id,
            blockData: originalData,
            signPublicKey: this.user.signKeys.publicKey,
            timestamp: Date.now(),
            scheme: this.scheme,
            encryptorType
        };

        const { teamEncrypted, encryptedVersions } = await this.encryptForMultipleRecipients(
            dataString,
            recipientPublicKeys,
            encryptorType
        );

        if (encryptorType === ENCRYPTOR_TYPES.TEAM) {
            if (!teamEncrypted) {
                throw new Error("Team encryption failed: no encrypted data returned");
            }

            return {
                ...baseBlock,
                teamEncrypted,
                teamKeys: this.teamKeys
            };
        } else {
            return {
                ...baseBlock,
                encryptedVersions
            };
        }
    }

    // ========== Decryption Methods ==========

    async decryptTeamBlock(block) {
        if (!block.teamEncrypted) {
            throw new Error("Invalid team block structure: missing teamEncrypted property");
        }

        // Set appropriate team keys
        if (block.teamKeys) {
            console.log("[MultiRecipientCrypto] Using team keys from block");
            this.setTeamKeys(block.teamKeys);
        } else if (!this.teamKeys) {
            throw new Error("No team keys available for decryption");
        } else {
            console.log("[MultiRecipientCrypto] Using existing team keys");
        }

        const encryptor = await this.createTeamEncryptor(this.teamKeys);
        
        // Check if encryptor can decrypt
        if (encryptor.can_decrypt === false) {
            throw new Error('Team encryptor does not have decryption capability with current keys');
        }
        
        console.log("[MultiRecipientCrypto] Team encryptor created, attempting to decrypt");
        console.log("[MultiRecipientCrypto] Encrypted data type:", typeof block.teamEncrypted);
        
        try {
            // skipValidation is explicitly set to false to ensure signatures are always verified
            // This is a security measure - only set to true in special circumstances where
            // signature validation is handled elsewhere or not needed
            const result = await encryptor.decrypt(block.teamEncrypted, false);
            
            if (!result) {
                throw new Error('Decryption succeeded but returned null or undefined result');
            }
            
            if (!result.content) {
                console.warn("[MultiRecipientCrypto] Decryption succeeded but content is missing");
                // Try to handle various result formats that might be returned
                if (typeof result === 'string') {
                    return result;
                } else if (result.author) {
                    // If we have author but no content, the API might be returning a different structure
                    return JSON.stringify(result);
                }
                throw new Error('Team decryption succeeded but returned invalid content structure');
            }
            
            return result.content;
        } catch (error) {
            console.error("[MultiRecipientCrypto] Team decryption failed:", error);
            throw error;
        }
    }

    async decryptMailboxBlock(block) {
        if (!block.encryptedVersions) {
            throw new Error("Invalid mailbox block structure: missing encryptedVersions property");
        }

        const myVersion = block.encryptedVersions[this.user.kemKeys.publicKey];
        if (!myVersion) {
            throw new Error("No encrypted version found for this user");
        }

        const encryptor = await this.createMailboxEncryptor();
        if (!block.signPublicKey) {
            throw new Error("Missing signature validation key in block");
        }

        return await encryptor.decrypt(
            myVersion,
            block.signPublicKey
        );
    }

    async decryptSharedBlock(block) {
        await this.ensureInitialized();
        const startTime = performance.now();
        let decryptedData = null;
        let error = null;

        try {
            if (!block) {
                throw new Error("Block is undefined");
            }

            const isTeamEncryption = block.encryptorType === ENCRYPTOR_TYPES.TEAM;

            const decryptStart = performance.now();

            if (isTeamEncryption) {
                decryptedData = await this.decryptTeamBlock(block);
            } else {
                decryptedData = await this.decryptMailboxBlock(block);
            }

            const totalDecryptTime = performance.now() - decryptStart;
            const stats = {
                encryptTime: 0,
                signTime: 0,
                decryptTime: totalDecryptTime * 0.7,
                verifyTime: totalDecryptTime * 0.3,
                totalTime: performance.now() - startTime
            };

            this.user.stats.push(stats);
        } catch (err) {
            error = err.message;
            console.error(`[MultiRecipientCrypto] Decryption error:`, err);
        }

        const totalTime = performance.now() - startTime;

        return {
            valid: !!decryptedData && !error,
            signatureValid: !!decryptedData && !error,
            decryptionValid: !!decryptedData && !error,
            time: totalTime,
            verifyTime: error ? 0 : totalTime * 0.3,
            decryptTime: error ? 0 : totalTime * 0.7,
            decryptedData,
            error
        };
    }
}

