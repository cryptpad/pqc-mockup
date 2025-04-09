import { ml_kem1024 } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/ml-kem/+esm";
import { ml_dsa87 } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/ml-dsa/+esm";
import { utf8ToBytes, randomBytes } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/utils/+esm";

export class User {
    constructor(id) {
        this.id = id;
        this.stats = [];
        this.kemKeys = null;
        this.signKeys = null;
    }

    async init() {
        try {
            const kemSeed = randomBytes(64);
            this.kemKeys = ml_kem1024.keygen(kemSeed);

            const dsaSeed = randomBytes(32);
            this.signKeys = ml_dsa87.keygen(dsaSeed);

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

    _textToBytes(text) {
        if (typeof text !== 'string') {
            throw new Error('Input must be a string');
        }
        return utf8ToBytes(text);
    }

    async encryptData(data, recipientPublicKey) {
        if (!recipientPublicKey) {
            throw new Error('Recipient public key is required');
        }

        const start = performance.now();
        try {
            const dataBytes = this._textToBytes(data);
            console.log(`Encrypting for user with public key length: ${recipientPublicKey.length}`);

            const { cipherText, sharedSecret } = ml_kem1024.encapsulate(recipientPublicKey);

            if (!cipherText || !sharedSecret) {
                throw new Error('Encryption failed: missing cipherText or sharedSecret');
            }

            // XOR encryption for now
            const encryptedData = Array.from(dataBytes.map((b, i) =>
                b ^ sharedSecret[i % sharedSecret.length]));

            console.log('Encryption successful', {
                plaintextLength: dataBytes.length,
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
            const dataBytes = this._textToBytes(data);
            const signature = ml_dsa87.sign(this.signKeys.secretKey, dataBytes);

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
        if (!block || !block.signature || !block.signPublicKey) {
            throw new Error('Invalid block format');
        }

        const startTime = performance.now();
        let verifyTime = 0;
        let decryptTime = 0;
        let signatureValid = false;
        let decryptionValid = false;
        let decryptedData = null;
        let error = null;

        const verifyStart = performance.now();
        const dataBytes = this._textToBytes(block.blockData);

        try {
            signatureValid = ml_dsa87.verify(block.signPublicKey, dataBytes, block.signature);
            console.log('Raw verification result:', signatureValid, typeof signatureValid);

            verifyTime = this._trackPerformance('verifyTime', verifyStart);

            if (signatureValid) {
                const decryptStart = performance.now();
                try {
                    console.log('Starting decryption with ciphertext length:', block.ciphertext.length);
                    console.log('Secret key length:', this.kemKeys.secretKey.length);

                    // Ensure both parameters are Uint8Array
                    const secretKey = this.kemKeys.secretKey instanceof Uint8Array ?
                        this.kemKeys.secretKey : new Uint8Array(this.kemKeys.secretKey);

                    const ciphertext = block.ciphertext instanceof Uint8Array ?
                        block.ciphertext : new Uint8Array(block.ciphertext);

                    console.log('Secret key type:', secretKey.constructor.name);
                    console.log('Ciphertext type:', ciphertext.constructor.name);

                    try {
                        const sharedSecret = ml_kem1024.decapsulate(ciphertext, secretKey);
                        console.log('Decapsulation succeeded with shared secret length:', sharedSecret.length);

                        const encryptedArray = block.encryptedData;
                        const decryptedBytes = new Uint8Array(encryptedArray.length);

                        for (let i = 0; i < encryptedArray.length; i++) {
                            decryptedBytes[i] = sharedSecret[i % sharedSecret.length] ^ encryptedArray[i];
                        }

                        decryptedData = new TextDecoder().decode(decryptedBytes);
                        decryptionValid = true;
                    } catch (decapError) {
                        console.error('Decapsulation error (full):', decapError);
                        console.error('Stack trace:', decapError.stack);
                        throw new Error(`KEM decapsulation failed: ${decapError.message}`);
                    }
                } catch (decryptError) {
                    error = decryptError.message || 'Unknown decryption error';
                    console.error('Complete decryption error:', decryptError);
                }
                decryptTime = this._trackPerformance('decryptTime', decryptStart);
                console.log('Final result:', {signatureValid, decryptionValid});
            }
        } catch (verifyError) {
            error = verifyError.message;
        }

        const totalTime = performance.now() - startTime;

        return {
            valid: signatureValid && decryptionValid,
            signatureValid,
            decryptionValid,
            time: totalTime,
            verifyTime,
            decryptTime,
            decryptedData,
            error
        };
    }
}