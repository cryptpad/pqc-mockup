import { loadCryptoModule } from './cryptoLoader.js';

export class NaclCryptoProvider {
    constructor() {
        this.cryptoModule = null;
        this.initialized = false;
        this.initPromise = null;
        console.log('[NaclProvider] Initialized NaCl crypto provider');
    }

    async init() {
        if (this.initialized) {
            return true;
        }
        
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise(async (resolve, reject) => {
            try {
                this.cryptoModule = await loadCryptoModule();
                
                this.validateCryptoModule();
                this.initialized = true;
                resolve(true);
            } catch (error) {
                console.error('[NaclProvider] Initialization failed:', error);
                this.initPromise = null;
                reject(error);
            }
        });

        return this.initPromise;
    }

    // ========== Utility Methods ==========

    validateCryptoModule() {
        if (!this.cryptoModule) {
            throw new Error('Failed to load chainpad_crypto module');
        }

        if (!this.cryptoModule.Nacl) {
            throw new Error('Nacl implementation not found in crypto module');
        }

        if (!this.cryptoModule.Mailbox) {
            throw new Error('Mailbox implementation not found in crypto module');
        }
    }

    async ensureInitialized() {
        if (!this.initialized) {
            await this.init();
        }
        return this.initialized;
    }
    
    async textToBytes(text) {
        await this.ensureInitialized();

        if (text === null || text === undefined) {
            return new Uint8Array(0);
        }

        if (text instanceof Uint8Array) {
            return text;
        }

        try {
            const textStr = String(text);
            if (this.cryptoModule.Nacl?.util?.decodeUTF8) {
                return this.cryptoModule.Nacl.util.decodeUTF8(textStr);
            }
            else if (this.cryptoModule.decodeUTF8) {
                return this.cryptoModule.decodeUTF8(textStr);
            }
            else {
                return new TextEncoder().encode(textStr);
            }
        } catch (err) {
            console.error('[NaclProvider] Error converting text to bytes:', err);
            return new Uint8Array(0);
        }
    }

    async bytesToText(bytes) {
        await this.ensureInitialized();

        if (!bytes) {
            return '';
        }

        try {
            if (this.cryptoModule.Nacl?.util?.encodeUTF8) {
                return this.cryptoModule.Nacl.util.encodeUTF8(bytes);
            }
            else if (this.cryptoModule.encodeUTF8) {
                return this.cryptoModule.encodeUTF8(bytes);
            }
            else {
                return new TextDecoder().decode(bytes);
            }
        } catch (err) {
            console.error('[NaclProvider] Error converting bytes to text:', err);
            return '';
        }
    }

    // ========== Key Generation Methods ==========

    async generateKEMKeyPair() {
        await this.ensureInitialized();
        const keypair = this.cryptoModule.Nacl.box.keyPair();
        return {
            publicKey: this.cryptoModule.Nacl.util.encodeBase64(keypair.publicKey),
            secretKey: this.cryptoModule.Nacl.util.encodeBase64(keypair.secretKey)
        };
    }

    async generateDSAKeyPair() {
        await this.ensureInitialized();
        const keypair = this.cryptoModule.Nacl.sign.keyPair();
        return {
            publicKey: this.cryptoModule.Nacl.util.encodeBase64(keypair.publicKey),
            secretKey: this.cryptoModule.Nacl.util.encodeBase64(keypair.secretKey)
        };
    }

    // ========== Encryptor Creation Methods ==========

    async createMailboxEncryptor(keys) {
        await this.ensureInitialized();
        console.log('[NaclProvider] Creating Mailbox encryptor with NaCl');
        
        if (!this.cryptoModule || !this.cryptoModule.Mailbox) {
            throw new Error('Crypto module or Mailbox not available');
        }
        
        try {
            const mailboxEncryptor = this.cryptoModule.Mailbox.createEncryptor(keys);
            
            return {
                encrypt: async (plain, recipient) => {
                    try {
                        console.log('[NaclProvider] Encrypting with NaCl Mailbox encryptor');
                        if (!mailboxEncryptor.encrypt) {
                            throw new Error('Encryptor is missing encrypt method');
                        }
                        return mailboxEncryptor.encrypt(plain, recipient);
                    } catch (err) {
                        console.error('[NaclProvider] Encryption failed:', err);
                        throw err;
                    }
                },
                decrypt: async (cipher, validateKey) => {
                    try {
                        console.log('[NaclProvider] Decrypting with NaCl Mailbox encryptor');
                        if (!mailboxEncryptor.decrypt) {
                            throw new Error('Encryptor is missing decrypt method');
                        }

                        const skipValidation = validateKey === undefined || validateKey === null;
                        
                        if (skipValidation) {
                            console.warn('[NaclProvider] WARNING: Signature validation skipped - no validation key provided');
                        }
                        
                        return mailboxEncryptor.decrypt(cipher, validateKey, skipValidation);
                    } catch (err) {
                        console.error('[NaclProvider] Decryption failed:', err);
                        throw err;
                    }
                }
            };
        } catch (error) {
            console.error('[NaclProvider] Error creating mailbox encryptor:', error);
            throw error;
        }
    }

    async createTeamEncryptor(keys) {
        await this.ensureInitialized();
        console.log('[NaclProvider] Creating Team encryptor with NaCl');
        
        if (!this.cryptoModule || !this.cryptoModule.Team) {
            throw new Error('Crypto module or Team not available');
        }
        
        try {
            this.validateTeamKeys(keys);
            const formattedKeys = { ...keys };

            console.log('[NaclProvider] Keys validated, creating team encryptor');
            const teamEncryptor = this.cryptoModule.Team.createEncryptor(formattedKeys);

            if (!teamEncryptor) {
                throw new Error('Failed to create Team encryptor');
            }

            console.log('[NaclProvider] Team encryptor created successfully');

            return {
                encrypt: async (plain) => {
                    try {
                        console.log('[NaclProvider] Encrypting with NaCl Team encryptor');
                        if (!teamEncryptor.encrypt) {
                            throw new Error('Team Encryptor is missing encrypt method');
                        }
                        const encrypted = teamEncryptor.encrypt(plain);
                        if (!encrypted) {
                            throw new Error('Team encryption returned null or undefined');
                        }
                        return encrypted;
                    } catch (err) {
                        console.error('[NaclProvider] Team encryption failed:', err);
                        throw err;
                    }
                },
                decrypt: async (cipher, skipValidation) => {
                    try {
                        console.log('[NaclProvider] Decrypting with NaCl Team encryptor');
                        if (!teamEncryptor.decrypt) {
                            throw new Error('Team Encryptor is missing decrypt method');
                        }

                        if (!cipher) {
                            throw new Error('Cannot decrypt empty or null cipher');
                        }

                        if (skipValidation === true) {
                            console.warn('[NaclProvider] WARNING: Signature validation explicitly skipped for team message');
                        }

                        const result = teamEncryptor.decrypt(cipher, skipValidation === true);

                        if (!result) {
                            throw new Error('Team decryption returned null or undefined');
                        }

                        return result;
                    } catch (err) {
                        console.error('[NaclProvider] Team decryption failed:', err);
                        throw err;
                    }
                }
            };
        } catch (error) {
            console.error('[NaclProvider] Error creating team encryptor:', error);
            throw error;
        }
    }

    // ========== Key Validation Methods ==========

    validateTeamKeys(keys) {
        const requiredKeys = [
            'teamCurvePublic', 'teamCurvePrivate',
            'teamEdPublic', 'teamEdPrivate',
            'myCurvePublic', 'myCurvePrivate'
        ];

        const missingKeys = requiredKeys.filter(key => !keys[key]);
        if (missingKeys.length > 0) {
            throw new Error(`Missing required team keys: ${missingKeys.join(', ')}`);
        }

        for (const key of requiredKeys) {
            try {
                const decoded = this.cryptoModule.Nacl.util.decodeBase64(keys[key]);
                const keyType = key.includes('Ed') ? 'sign' : 'box';
                const lengthType = key.includes('Public') ? 'publicKeyLength' : 'secretKeyLength';
                
                if (decoded.length !== this.cryptoModule.Nacl[keyType][lengthType]) {
                    throw new Error(`Invalid ${key} length: ${decoded.length}`);
                }
            } catch (e) {
                throw new Error(`Invalid base64 encoding for key ${key}: ${e.message}`);
            }
        }

        return true;
    }
}

export function createNaclProvider() {
    return new NaclCryptoProvider();
}
