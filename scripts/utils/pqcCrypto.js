import { ml_kem1024 } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/ml-kem/+esm";
import { ml_dsa87 } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/ml-dsa/+esm";


export function textToBytes(text) {
    return new TextEncoder().encode(text);
}

export function bytesToText(bytes) {
    return new TextDecoder().decode(bytes);
}

export function verifySignature(publicKey, data, signature) {
    const pubKey = publicKey instanceof Uint8Array ?
        publicKey : new Uint8Array(publicKey);

    const dataBytes = data instanceof Uint8Array ?
        data : textToBytes(data);

    const sig = signature instanceof Uint8Array ?
        signature : new Uint8Array(signature);

    return ml_dsa87.verify(pubKey, dataBytes, sig);
}

export function decapsulateSecret(ciphertext, secretKey) {
    const ct = ciphertext instanceof Uint8Array ?
        ciphertext : new Uint8Array(ciphertext);

    const sk = secretKey instanceof Uint8Array ?
        secretKey : new Uint8Array(secretKey);

    return ml_kem1024.decapsulate(ct, sk);
}

export function encapsulateSecret(publicKey) {
    const pk = publicKey instanceof Uint8Array ?
        publicKey : new Uint8Array(publicKey);

    return ml_kem1024.encapsulate(pk);
}

export function encryptData(data, sharedSecret) {
    const dataBytes = data instanceof Uint8Array ?
        data : textToBytes(data);

    const encryptedData = new Uint8Array(dataBytes.length);

    for (let i = 0; i < dataBytes.length; i++) {
        encryptedData[i] = sharedSecret[i % sharedSecret.length] ^ dataBytes[i];
    }

    return encryptedData;
}

export function decryptData(encryptedData, sharedSecret) {
    const decryptedBytes = new Uint8Array(encryptedData.length);

    for (let i = 0; i < encryptedData.length; i++) {
        decryptedBytes[i] = sharedSecret[i % sharedSecret.length] ^ encryptedData[i];
    }

    return bytesToText(decryptedBytes);
}

export function verifyAndDecryptBlock(block, secretKey) {
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
    const dataBytes = textToBytes(block.blockData);

    try {
        signatureValid = verifySignature(block.signPublicKey, dataBytes, block.signature);

        verifyTime = performance.now() - verifyStart;

        if (signatureValid) {
            const decryptStart = performance.now();
            try {
                const sharedSecret = decapsulateSecret(block.ciphertext, secretKey);

                const decryptedBytes = decryptData(block.encryptedData, sharedSecret);
                decryptedData = decryptedBytes;
                decryptionValid = true;
            } catch (decryptError) {
                error = decryptError.message || 'Unknown decryption error';
                console.error('Complete decryption error:', decryptError);
            }
            decryptTime = performance.now() - decryptStart;
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


export function generateKEMKeyPair() {
    return ml_kem1024.keygen();
}

export function generateDSAKeyPair() {
    return ml_dsa87.keygen();
}

export function signData(secretKey, data) {
    const sk = secretKey instanceof Uint8Array ?
        secretKey : new Uint8Array(secretKey);

    const dataBytes = data instanceof Uint8Array ?
        data : textToBytes(data);

    return ml_dsa87.sign(sk, dataBytes);
}

export function createMailboxEncryptor(keys) {
    return {
        encrypt: async function(data, recipientPublicKey) {
            console.log('[PQC Mailbox] Starting encryption process');

            const { cipherText, sharedSecret } = await encapsulateSecret(recipientPublicKey);
            console.log('[PQC Mailbox] Secret encapsulated successfully');

            const dataBytes = typeof data === 'string' ? textToBytes(data) : data;

            const encryptedData = await encryptData(dataBytes, sharedSecret);
            console.log('[PQC Mailbox] Data encrypted successfully');


            const signature = await signData(keys.signingKey, dataBytes);
            console.log('[PQC Mailbox] Data signed successfully');

            return {
                encryptedData,
                ciphertext: cipherText,
                signature,
                senderPublicKey: keys.curvePublic,
                data: dataBytes
            };
        },

        decrypt: async function(message, senderPublicKey) {
            console.log('[PQC Mailbox] Starting decryption process');
            const { encryptedData, ciphertext, signature, data } = message;

            if (!data) {
                console.error('[PQC Mailbox] Missing original data needed for verification');
                throw new Error('Missing original data needed for verification');
            }

            try {
                console.log('[PQC Mailbox] Verifying signature...');
                const isValid = await verifySignature(senderPublicKey, data, signature);
                if (!isValid) {
                    console.error('[PQC Mailbox] Signature verification failed');
                    throw new Error('Invalid signature');
                }
                console.log('[PQC Mailbox] Signature verified successfully');


                const sharedSecret = await decapsulateSecret(ciphertext, keys.curvePrivate);
                console.log('[PQC Mailbox] Secret decapsulated successfully');

                const decryptedBytes = decryptData(encryptedData, sharedSecret);
                console.log('[PQC Mailbox] Data decrypted successfully');


                return typeof message.data === 'string' ? bytesToText(decryptedBytes) : decryptedBytes;
            } catch (error) {
                console.error('[PQC Mailbox] Decryption failed:', error);
                throw new Error(`Decryption failed: ${error.message}`);
            }
        }
    };
}