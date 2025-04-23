import { ml_kem1024 } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/ml-kem/+esm";
import { ml_dsa87 } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/ml-dsa/+esm";
import { gcm } from "https://cdn.jsdelivr.net/npm/@noble/ciphers/aes/+esm";

export class PQCProvider {
    constructor() {
        this.initialized = false;
        console.log('[PQCProvider] Initialized Post-Quantum crypto provider');
    }

    async init() {
        this.initialized = true;
        return true;
    }

    textToBytes(text) {
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

    generateKEMKeyPair() {
        return ml_kem1024.keygen();
    }

    generateDSAKeyPair() {
        return ml_dsa87.keygen();
    }

    encapsulateSecret(publicKey) {
        const pk = publicKey instanceof Uint8Array ?
            publicKey : new Uint8Array(publicKey);

        return ml_kem1024.encapsulate(pk);
    }

    decapsulateSecret(ciphertext, secretKey) {
        const ct = ciphertext instanceof Uint8Array ?
            ciphertext : new Uint8Array(ciphertext);

        const sk = secretKey instanceof Uint8Array ?
            secretKey : new Uint8Array(secretKey);

        return ml_kem1024.decapsulate(ct, sk);
    }

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

    signData(data, secretKey) {
        const sk = secretKey instanceof Uint8Array ?
            secretKey : new Uint8Array(secretKey);

        const dataBytes = data instanceof Uint8Array ?
            data : this.textToBytes(data);

        return ml_dsa87.sign(sk, dataBytes);
    }

    verifySignature(signature, data, publicKey) {
        const pubKey = publicKey instanceof Uint8Array ?
            publicKey : new Uint8Array(publicKey);

        const dataBytes = data instanceof Uint8Array ?
            data : this.textToBytes(data);

        const sig = signature instanceof Uint8Array ?
            signature : new Uint8Array(signature);

        return ml_dsa87.verify(pubKey, dataBytes, sig);
    }

    createMailboxEncryptor(keys) {
        console.log('[PQCProvider] Creating Mailbox encryptor with PQC');
        const provider = this;

        return {
            encrypt: async function(data, recipientPublicKey) {
                console.log('[PQC Mailbox] Starting encryption process');

                const { cipherText, sharedSecret } = await provider.encapsulateSecret(recipientPublicKey);
                console.log('[PQC Mailbox] Secret encapsulated successfully');

                const dataToEncrypt = typeof data === 'string' ? data : provider.bytesToText(data);

                const encryptedData = provider.encryptData(dataToEncrypt, sharedSecret);
                console.log('[PQC Mailbox] Data encrypted successfully');

                const signature = await provider.signData(
                    typeof data === 'string' ? provider.textToBytes(data) : data,
                    keys.signingKey
                );
                console.log('[PQC Mailbox] Data signed successfully');

                return {
                    encryptedData,
                    ciphertext: cipherText,
                    signature,
                    senderPublicKey: keys.curvePublic,
                    dataType: typeof data === 'string' ? 'string' : 'binary'
                };
            },

            decrypt: async function(message, senderPublicKey) {
                console.log('[PQC Mailbox] Starting decryption process');
                const { encryptedData, ciphertext, signature, dataType } = message;

                try {
                    const sharedSecret = await provider.decapsulateSecret(ciphertext, keys.curvePrivate);
                    console.log('[PQC Mailbox] Secret decapsulated successfully');

                    const decryptedText = provider.decryptData(encryptedData, sharedSecret);
                    console.log('[PQC Mailbox] Data decrypted successfully');

                    const decryptedData = dataType === 'string' ?
                        decryptedText : provider.textToBytes(decryptedText);

                    console.log('[PQC Mailbox] Verifying signature...');
                    const dataForVerification = dataType === 'string' ?
                        provider.textToBytes(decryptedText) : decryptedData;
                    const isValid = await provider.verifySignature(signature, dataForVerification, senderPublicKey);

                    if (!isValid) {
                        console.error('[PQC Mailbox] Signature verification failed');
                        throw new Error('Invalid signature');
                    }
                    console.log('[PQC Mailbox] Signature verified successfully');

                    return decryptedData;
                } catch (error) {
                    console.error('[PQC Mailbox] Decryption failed:', error);
                    throw new Error(`Decryption failed: ${error.message}`);
                }
            }
        };
    }

    createTeamEncryptor(keys) {
        console.log('[PQCProvider] Creating Team encryptor with PQC');
        console.log('[PQCProvider] Note: PQC Team Encryptor is not fully implemented yet, using placeholder');
        
        return {
            encrypt: async function(data) {
                console.log('[PQC Team Encryptor] Encryption called - NOT YET IMPLEMENTED');

                return {
                    notImplemented: true,
                    message: "PQC Team Encryptor not yet implemented",
                    placeholder: true,
                    originalData: typeof data === 'string' ? data : JSON.stringify(data)
                };
            },
            
            decrypt: async function(message, skipValidation) {
                console.log('[PQC Team Encryptor] Decryption called - NOT YET IMPLEMENTED');
                console.log('[PQC Team Encryptor] Skip validation parameter:', skipValidation);

                if (message && message.placeholder && message.notImplemented) {
                    console.log('[PQC Team Encryptor] Returning placeholder data');
                    return {
                        content: message.originalData,
                        author: "placeholder-author"
                    };
                }
                
                throw new Error('PQC Team Encryptor not yet implemented');
            }
        };
    }
}

export function createPQCProvider() {
    return new PQCProvider();
}

