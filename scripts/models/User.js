import {getCryptoProvider, CRYPTO_SCHEMES} from '../utils/cryptoProvider.js'

export class User {
    constructor(id, cryptoScheme = CRYPTO_SCHEMES.PQC) {
        this.id = id;
        this.stats = [];
        this.kemKeys = null;
        this.signKeys = null;
        this.cryptoProvider = getCryptoProvider(cryptoScheme)
    }

    async init() {
        try {
            this.kemKeys = this.cryptoProvider.generateKEMKeyPair();
            this.signKeys = this.cryptoProvider.generateDSAKeyPair();
            return true;
        } catch (error) {
            console.error(`Failed to initialize keys for user ${this.id}:`, error);
            return false;
        }
    }

    _trackPerformance(operation, startTime, data = {}) {
        const duration = performance.now() - startTime;
        this.stats.push({ [operation]: duration, ...data });
        return duration;
    }

    async encryptData(data, recipientPublicKey) {
        if (!recipientPublicKey) {
            throw new Error('Recipient public key is required');
        }

        const start = performance.now();
        try {
            console.log(`Encrypting for user with public key length: ${recipientPublicKey.length}`);

            const { cipherText, sharedSecret } = this.cryptoProvider.encapsulateSecret(recipientPublicKey);

            if (!cipherText || !sharedSecret) {
                throw new Error('Encryption failed: missing cipherText or sharedSecret');
            }

            const encryptedData = this.cryptoProvider.encryptData(data, sharedSecret);

            console.log('Encryption successful', {
                plaintextLength: this.cryptoProvider.textToBytes(data).length,
                encryptedLength: encryptedData.length,
                ciphertextLength: cipherText.length
            });

            this._trackPerformance('encryptTime', start);
            return { encryptedData, ciphertext: cipherText };
        } catch (error) {
            this._trackPerformance('encryptTime', start, { error: true });
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    async signData(data) {
        if (!this.signKeys) {
            throw new Error('Signing keys not initialized');
        }

        const start = performance.now();
        try {
            const signature = this.cryptoProvider.signData(this.signKeys.secretKey, data);

            this._trackPerformance('signTime', start);
            return { signature, originalData: data };
        } catch (error) {
            this._trackPerformance('signTime', start, { error: true });
            throw new Error(`Signing failed: ${error.message}`);
        }
    }

    async encryptAndSignBlock(blockData, recipientPublicKey) {
        try {
            const encryptionResult = await this.encryptData(blockData, recipientPublicKey);
            const { signature } = await this.signData(blockData);

            return {
                userId: this.id,
                blockData,
                encryptedData: encryptionResult.encryptedData,
                ciphertext: encryptionResult.ciphertext,
                signature,
                publicKey: this.kemKeys.publicKey,
                signPublicKey: this.signKeys.publicKey
            };
        } catch (error) {
            console.error(`Failed to encrypt and sign block for user ${this.id}:`, error);
            throw error;
        }
    }

    async verifyAndDecryptBlock(block) {
        if (!this.kemKeys) {
            throw new Error('KEM keys not initialized');
        }

        const result = this.cryptoProvider.verifyAndDecryptBlock(block, this.kemKeys.secretKey);

        if (result.verifyTime) {
            this._trackPerformance('verifyTime', performance.now() - result.verifyTime);
        }

        if (result.decryptTime) {
            this._trackPerformance('decryptTime', performance.now() - result.decryptTime);
        }

        return result;
    }
}