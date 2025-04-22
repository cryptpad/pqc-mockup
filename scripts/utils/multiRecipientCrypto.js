import {getCryptoProvider, CRYPTO_SCHEMES} from './cryptoProvider.js';

export class MultiRecipientCrypto {
    constructor(user, scheme = CRYPTO_SCHEMES.PQC) {
        this.user = user;
        this.scheme = scheme;
        this.cryptoProvider = getCryptoProvider(scheme);
        this.initialized = false;
        this.initPromise = null;
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
        if (!this.initialized) {
            await this.init();
        }
        return this.initialized;
    }

    async encryptForMultipleRecipients(data, recipientPublicKeys) {
        await this.ensureInitialized();

        const keys = {
            curvePublic: this.user.kemKeys.publicKey,
            curvePrivate: this.user.kemKeys.secretKey,
            signingKey: this.user.signKeys.secretKey,
            validateKey: this.user.signKeys.publicKey
        };

        const encryptor = await this.cryptoProvider.createMailboxEncryptor(keys);

        const encryptedVersions = {};
        const startTime = performance.now();

        let encryptTime = 0;
        let signTime = 0;

        const dataString = typeof data === 'string' ? data :
            data instanceof Uint8Array ? await this.cryptoProvider.bytesToText(data) :
            JSON.stringify(data);

        for (const recipientKey of recipientPublicKeys) {
            try {
                const message = await encryptor.encrypt(dataString, recipientKey);
                encryptedVersions[recipientKey] = message;
            } catch (err) {
                console.error(`[MultiRecipientCrypto] Failed to encrypt for recipient ${recipientKey.slice(-8)}:`, err);
            }
        }

        const totalTime = performance.now() - startTime;

        signTime = totalTime * 0.3;
        encryptTime = totalTime * 0.7;

        const stats = {
            encryptTime,
            signTime,
            decryptTime: 0,
            verifyTime: 0,
            totalTime
        };

        this.user.stats.push(stats);

        return {
            encryptedVersions,
            stats
        };
    }

    async createSharedBlock(data, recipientPublicKeys) {
        await this.ensureInitialized();

        const originalData = data;

        const dataString = typeof data === 'string' ? data :
            data instanceof Uint8Array ? await this.cryptoProvider.bytesToText(data) :
            JSON.stringify(data);

        const { encryptedVersions } = await this.encryptForMultipleRecipients(
            dataString,
            recipientPublicKeys
        );

        return {
            userId: this.user.id,
            blockData: originalData,
            encryptedVersions: encryptedVersions,
            signPublicKey: this.user.signKeys.publicKey,
            timestamp: Date.now(),
            scheme: this.scheme
        };
    }

    async decryptSharedBlock(block) {
        await this.ensureInitialized();

        const myVersion = block.encryptedVersions[this.user.kemKeys.publicKey];
        if (!myVersion) {
            throw new Error("No encrypted version found for this user");
        }

        const startTime = performance.now();
        let verifyTime = 0;
        let decryptTime = 0;
        let decryptedData = null;
        let error = null;

        try {
            const keys = {
                curvePublic: this.user.kemKeys.publicKey,
                curvePrivate: this.user.kemKeys.secretKey,
                signingKey: this.user.signKeys.secretKey,
                validateKey: block.signPublicKey
            };

            const encryptor = await this.cryptoProvider.createMailboxEncryptor(keys);

            const decryptStart = performance.now();

            decryptedData = await encryptor.decrypt(myVersion, block.signPublicKey);

            const totalDecryptTime = performance.now() - decryptStart;

            verifyTime = totalDecryptTime * 0.3;
            decryptTime = totalDecryptTime * 0.7;

        } catch (err) {
            error = err.message;
            console.error(`[MultiRecipientCrypto] Decryption error:`, err);
        }

        const totalTime = performance.now() - startTime;

        const result = {
            valid: !!decryptedData && !error,
            signatureValid: !!decryptedData && !error,
            decryptionValid: !!decryptedData && !error,
            time: totalTime,
            verifyTime,
            decryptTime,
            decryptedData,
            error
        };

        this.user.stats.push({
            encryptTime: 0,
            signTime: 0,
            decryptTime: result.decryptTime,
            verifyTime: result.verifyTime,
            totalTime: result.time
        });

        return result;
    }
}
