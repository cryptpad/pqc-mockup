import { ml_kem1024 } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/ml-kem/+esm";
import { ml_dsa87 } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/ml-dsa/+esm";
import { gcm } from "https://cdn.jsdelivr.net/npm/@noble/ciphers/aes/+esm";

export class PQCProvider {
    constructor() {
        this.initialized = false;
    }

    async init() {
        this.initialized = true;
        return true;
    }

    // ========== Utility Methods ==========

    textToBytes(text) {
        if (text instanceof Uint8Array) return text;
        return new TextEncoder().encode(text);
    }

    bytesToText(bytes) {
        return new TextDecoder().decode(bytes);
    }

    encodeBase64(bytes) {
        return btoa(String.fromCharCode.apply(null, bytes));
    }

    decodeBase64(str) {
        return new Uint8Array(
            atob(str).split('').map(c => c.charCodeAt(0))
        );
    }

    concatUint8Arrays(arrays) {
        const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const array of arrays) {
            result.set(array, offset);
            offset += array.length;
        }
        return result;
    }

    _ensureUint8Array(data) {
        return data instanceof Uint8Array ? data : new Uint8Array(data);
    }

    // ========== Key Generation Methods ==========

    generateKEMKeyPair() {
        return ml_kem1024.keygen();
    }

    generateDSAKeyPair() {
        return ml_dsa87.keygen();
    }

    // ========== Key Encapsulation Methods ==========

    encapsulateSecret(publicKey) {
        const pk = this._ensureUint8Array(publicKey);
        return ml_kem1024.encapsulate(pk);
    }

    decapsulateSecret(ciphertext, secretKey) {
        const ct = this._ensureUint8Array(ciphertext);
        const sk = this._ensureUint8Array(secretKey);
        return ml_kem1024.decapsulate(ct, sk);
    }

    // ========== Symmetric Encryption Methods ==========

    encryptData(data, sharedSecret) {
        const dataBytes = data instanceof Uint8Array ? data : this.textToBytes(data);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const key = sharedSecret.slice(0, 32);
        const ciphertext = gcm(key, iv).encrypt(dataBytes);

        const result = new Uint8Array(iv.length + ciphertext.length);
        result.set(iv);
        result.set(ciphertext, iv.length);

        return this.encodeBase64(result);
    }

    decryptData(encryptedData, sharedSecret) {
        try {
            const encryptedBytes = this.decodeBase64(encryptedData);
            const iv = encryptedBytes.slice(0, 12);
            const ciphertext = encryptedBytes.slice(12);
            const key = sharedSecret.slice(0, 32);
            const decryptedBytes = gcm(key, iv).decrypt(ciphertext);
            return this.bytesToText(decryptedBytes);
        } catch (error) {
            console.error('[PQC] AES Decryption error:', error);
            throw new Error(`AES Decryption failed: ${error.message}`);
        }
    }

    // ========== Digital Signature Methods ==========

    signData(data, secretKey) {
        const sk = this._ensureUint8Array(secretKey);
        const dataBytes = data instanceof Uint8Array ? data : this.textToBytes(data);
        return ml_dsa87.sign(sk, dataBytes);
    }

    verifySignature(signature, data, publicKey) {
        const pubKey = this._ensureUint8Array(publicKey);
        const dataBytes = data instanceof Uint8Array ? data : this.textToBytes(data);
        const sig = this._ensureUint8Array(signature);
        return ml_dsa87.verify(pubKey, dataBytes, sig);
    }

    // ========== Encryptor Creation Methods ==========

    createMailboxEncryptor(keys) {
        const provider = this;

        return {
            encrypt: async function(data, recipientPublicKey) {
                const { cipherText, sharedSecret } = await provider.encapsulateSecret(recipientPublicKey);

                const dataToEncrypt = typeof data === 'string' ? data : provider.bytesToText(data);
                const encryptedData = provider.encryptData(dataToEncrypt, sharedSecret);

                const signature = await provider.signData(
                    typeof data === 'string' ? provider.textToBytes(data) : data,
                    keys.signingKey
                );

                return {
                    encryptedData,
                    ciphertext: cipherText,
                    signature,
                    senderPublicKey: keys.curvePublic,
                    dataType: typeof data === 'string' ? 'string' : 'binary'
                };
            },

            decrypt: async function(message, senderPublicKey) {
                const { encryptedData, ciphertext, signature, dataType } = message;

                try {
                    const sharedSecret = await provider.decapsulateSecret(ciphertext, keys.curvePrivate);

                    const decryptedText = provider.decryptData(encryptedData, sharedSecret);

                    const decryptedData = dataType === 'string' ?
                        decryptedText : provider.textToBytes(decryptedText);

                    const dataForVerification = dataType === 'string' ?
                        provider.textToBytes(decryptedText) : decryptedData;
                    const isValid = await provider.verifySignature(signature, dataForVerification, senderPublicKey);

                    if (!isValid) {
                        throw new Error('Invalid signature');
                    }

                    return decryptedData;
                } catch (error) {
                    console.error('[PQC Mailbox] Decryption failed:', error);
                    throw new Error(`Decryption failed: ${error.message}`);
                }
            }
        };
    }

    createTeamEncryptor(keys) {
        this.validateTeamKeys(keys);
        const provider = this;

        const canEncrypt = true;
        const canDecrypt = true;
        
        return {
            encrypt: async function(data) {
                try {
                    return await provider.teamEncrypt(data, keys);
                } catch (error) {
                    console.error('[PQC Team Encryptor] Encryption failed:', error);
                    throw new Error(`Team encryption failed: ${error.message}`);
                }
            },
            
            decrypt: async function(message, skipValidation = false) {
                try {
                    return await provider.teamDecrypt(message, keys, skipValidation);
                } catch (error) {
                    console.error('[PQC Team Encryptor] Decryption failed:', error);
                    throw new Error(`Team decryption failed: ${error.message}`);
                }
            },

            can_encrypt: canEncrypt,
            can_decrypt: canDecrypt
        };
    }

    // ========== Team Encryption Methods ==========

    async teamEncrypt(data, keys) {
        const dataBytes = typeof data === 'string' ? this.textToBytes(data) : data;

        // Inner encryption layer
        const innerEncapsulation = await this.encapsulateSecret(keys.teamCurvePublic);
        const innerEncrypted = this.encryptData(dataBytes, innerEncapsulation.sharedSecret);

        // Create inner bundle with author information
        const innerBundle = {
            authorPublicKey: keys.myCurvePublic,
            encryptedData: innerEncrypted,
            ciphertext: this.encodeBase64(innerEncapsulation.cipherText)
        };
        const innerBundleBytes = this.textToBytes(JSON.stringify(innerBundle));

        // Outer encryption layer
        const ephemeralKeypair = await this.generateKEMKeyPair();
        const outerEncapsulation = await this.encapsulateSecret(keys.teamCurvePublic);
        const outerEncrypted = this.encryptData(innerBundleBytes, outerEncapsulation.sharedSecret);

        // Create outer bundle with ephemeral key
        const outerBundle = {
            encryptedData: outerEncrypted,
            ciphertext: this.encodeBase64(outerEncapsulation.cipherText),
            ephemeralPublicKey: ephemeralKeypair.publicKey
        };

        // Sign the entire outer bundle
        const outerBundleBytes = this.textToBytes(JSON.stringify(outerBundle));
        const signature = await this.signData(outerBundleBytes, keys.teamEdPrivate);

        return {
            outerBundle: outerBundle,
            signature: this.encodeBase64(signature)
        };
    }

    async teamDecrypt(message, keys, skipValidation) {
        try {
            const { outerBundle, signature } = message;

            // Validate signature if required
            if (!skipValidation) {
                const outerBundleBytes = this.textToBytes(JSON.stringify(outerBundle));
                const signatureBytes = this.decodeBase64(signature);
                const isValid = await this.verifySignature(
                    signatureBytes, 
                    outerBundleBytes, 
                    keys.teamEdPublic
                );
                
                if (!isValid) {
                    throw new Error('Invalid team signature');
                }
            }

            // Decrypt outer layer
            const outerCiphertext = this.decodeBase64(outerBundle.ciphertext);
            const outerSharedSecret = await this.decapsulateSecret(
                outerCiphertext, 
                keys.teamCurvePrivate
            );
            const decryptedOuterBundle = this.decryptData(
                outerBundle.encryptedData, 
                outerSharedSecret
            );

            // Parse inner bundle
            const innerBundle = JSON.parse(decryptedOuterBundle);

            // Decrypt inner layer
            const innerCiphertext = this.decodeBase64(innerBundle.ciphertext);
            const innerSharedSecret = await this.decapsulateSecret(
                innerCiphertext,
                keys.teamCurvePrivate
            );
            const decryptedData = this.decryptData(
                innerBundle.encryptedData, 
                innerSharedSecret
            );

            return {
                content: decryptedData,
                author: innerBundle.authorPublicKey
            };
        } catch (error) {
            console.error('[PQC Team] Decryption failed:', error);
            throw new Error(`Team decryption failed: ${error.message}`);
        }
    }

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
        
        return true;
    }
}

export function createPQCProvider() {
    return new PQCProvider();
}
