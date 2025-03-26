import { ml_kem1024 } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/ml-kem/+esm";
import { ml_dsa87 } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/ml-dsa/+esm";
import { utf8ToBytes, randomBytes } from "https://cdn.jsdelivr.net/npm/@noble/post-quantum/utils/+esm";

export class User {
    constructor(id) {
        this.id = id;
        this.stats = [];
    }

    async init() {
        const kemSeed = randomBytes(64);
        this.kemKeys = ml_kem1024.keygen(kemSeed);

        const dsaSeed = randomBytes(32);
        this.signKeys = ml_dsa87.keygen(dsaSeed);
    }

    async encryptData(data, recipientPublicKey) {
        const start = performance.now();
        const dataBytes = utf8ToBytes(data);
        const { cipherText, sharedSecret } = ml_kem1024.encapsulate(recipientPublicKey);

        if (!cipherText) {
            throw new Error('Encryption failed: cipherText is undefined');
        }

        const encryptedData = sharedSecret.map((b, i) => b ^ dataBytes[i % dataBytes.length]);
        const end = performance.now();
        this.stats.push({ encryptTime: end - start });

        return { encryptedData, ciphertext: cipherText };
    }

    async signData(data) {
        const start = performance.now();
        const dataBytes = utf8ToBytes(data);
        const signature = ml_dsa87.sign(this.signKeys.secretKey, dataBytes);
        const end = performance.now();
        this.stats.push({ signTime: end - start });

        return { signature, originalData: data };
    }

    async encryptAndSignBlock(blockData, recipientPublicKey) {
        const { encryptedData, ciphertext } = await this.encryptData(blockData, recipientPublicKey);
        const { signature, originalData } = await this.signData(blockData);

        return {
            userId: this.id,
            blockData: originalData,
            encryptedData,
            ciphertext,
            signature,
            publicKey: this.kemKeys.publicKey,
            signPublicKey: this.signKeys.publicKey
        };
    }

    async verifyAndDecryptBlock(block) {
        const verifyStart = performance.now();
        let verifyTime = 0;
        let decryptTime = 0;

        try {
            const dataBytes = utf8ToBytes(block.blockData);
            const valid = ml_dsa87.verify(block.signPublicKey, dataBytes, block.signature);
            verifyTime = performance.now() - verifyStart;
            this.stats.push({ verifyTime });

            let decryptedData = null;
            if (valid) {
                const decryptStart = performance.now();
                try {
                    const sharedSecret = ml_kem1024.decapsulate(this.kemKeys.secretKey, block.ciphertext);
                    decryptedData = sharedSecret.map((b, i) => b ^ block.encryptedData[i % block.encryptedData.length]);
                    decryptTime = performance.now() - decryptStart;
                    this.stats.push({ decryptTime });
                } catch (decryptError) {
                    decryptTime = performance.now() - decryptStart;
                    this.stats.push({ decryptTime });
                    return {
                        valid: true,
                        signatureValid: true,
                        decryptionValid: false,
                        time: verifyTime + decryptTime,
                        verifyTime,
                        decryptTime,
                        decryptedData: null,
                        error: decryptError.message
                    };
                }
            }

            return {
                valid: valid && decryptedData !== null,
                signatureValid: valid,
                decryptionValid: decryptedData !== null,
                time: verifyTime + decryptTime,
                verifyTime,
                decryptTime,
                decryptedData
            };
        } catch (error) {
            const totalTime = performance.now() - verifyStart;
            return {
                valid: false,
                time: totalTime,
                verifyTime,
                decryptTime,
                error: error.message
            };
        }
    }
}