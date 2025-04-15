import {getCryptoProvider, CRYPTO_SCHEMES} from './cryptoProvider.js';

export class MultiRecipientCrypto {
    constructor(user, scheme = CRYPTO_SCHEMES.PQC) {
        this.user = user;
        this.scheme = scheme;
        this.cryptoProvider = getCryptoProvider(scheme);
    }

    async init() {
        return this.cryptoProvider.init();
    }

    async encryptForMultipleRecipients(data, recipientPublicKeys) {
        await this.init();
        console.log(`[MultiRecipientCrypto] Encrypting data for ${recipientPublicKeys.length} recipients using ${this.scheme} scheme`);


        const keys = {
            curvePublic: this.user.kemKeys.publicKey,
            curvePrivate: this.user.kemKeys.secretKey,
            signingKey: this.user.signKeys.secretKey
        };

        const encryptor = this.cryptoProvider.createMailboxEncryptor(keys);

        const encryptedVersions = {};
        const startTime = performance.now();

        let encryptTime = 0;
        let signTime = 0;

        for (const recipientKey of recipientPublicKeys) {
            console.log(`[MultiRecipientCrypto] Encrypting for recipient with key ending: ...${recipientKey.slice(-8).toString()}`);
            const message = await encryptor.encrypt(data, recipientKey);
            encryptedVersions[recipientKey] = message;
        }

        const totalTime = performance.now() - startTime;
        console.log(`[MultiRecipientCrypto] Encryption completed in ${totalTime.toFixed(2)}ms`);


        signTime = totalTime * 0.3; // Estimate 30% of time for signing
        encryptTime = totalTime * 0.7; // Estimate 70% of time for encryption

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
        // Convert data to bytes if it's a string
        const dataBytes = typeof data === 'string' ?
            this.cryptoProvider.textToBytes(data) : data;

        const { encryptedVersions } = await this.encryptForMultipleRecipients(
            dataBytes,
            recipientPublicKeys
        );

        return {
            userId: this.user.id,
            blockData: dataBytes,
            encryptedVersions: encryptedVersions,
            signPublicKey: this.user.signKeys.publicKey,
            timestamp: Date.now(),
            scheme: this.scheme
        };
    }

    async decryptSharedBlock(block) {
        await this.init();
        console.log(`[MultiRecipientCrypto] Attempting to decrypt block from user ${block.userId} using ${this.scheme} scheme`);


        const myVersion = block.encryptedVersions[this.user.kemKeys.publicKey];
        if (!myVersion) {
            console.log(`[MultiRecipientCrypto] Available keys:`, Object.keys(block.encryptedVersions).map(k => `...${k.slice(-8).toString()}`));
            throw new Error("No encrypted version found for this user");
        }

        const startTime = performance.now();
        let verifyTime = 0;
        let decryptTime = 0;
        let decryptedData = null;
        let error = null;

        try {
            // Create keys for decryption
            const keys = {
                curvePublic: this.user.kemKeys.publicKey,
                curvePrivate: this.user.kemKeys.secretKey,
                signingKey: this.user.signKeys.secretKey
            };

            const encryptor = this.cryptoProvider.createMailboxEncryptor(keys);

            const decryptStart = performance.now();
            decryptedData = await encryptor.decrypt(myVersion, block.signPublicKey);
            const totalDecryptTime = performance.now() - decryptStart;

            verifyTime = totalDecryptTime * 0.3; // Estimate 30% for verification
            decryptTime = totalDecryptTime * 0.7; // Estimate 70% for decryption

            console.log(`[MultiRecipientCrypto] Successfully decrypted data`);

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

        console.log(`[MultiRecipientCrypto] Decryption result: ${result.valid ? 'Success' : 'Failed'}`);


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