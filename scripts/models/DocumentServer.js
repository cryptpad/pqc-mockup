export class DocumentServer {
    constructor(users) {
        this.users = users || [];
    }

    getUserById(userId) {
        return this.users.find(user => user.id === userId) || null;
    }

    async broadcastSharedBlock(block, recipientIds = []) {
        if (!block || !block.encryptedVersions) {
            throw new Error("Invalid block structure for broadcasting");
        }

        const deliveryResults = recipientIds.map(async (recipientId) => {
            try {
                const recipient = this.getUserById(recipientId);
                
                if (!recipient) {
                    throw new Error(`Recipient ${recipientId} not found`);
                }
                
                if (!recipient.decryptAndVerifyBlock || typeof recipient.decryptAndVerifyBlock !== 'function') {
                    throw new Error(`Recipient ${recipientId} cannot decrypt blocks (missing decryptAndVerifyBlock method)`);
                }
                
                const result = await recipient.decryptAndVerifyBlock(block);
                return {
                    recipientId,
                    success: true,
                    result
                };
            } catch (error) {
                console.error(`Error delivering to User ${recipientId}:`, error);
                return {
                    recipientId,
                    success: false,
                    error: error.message
                };
            }
        });

        return Promise.all(deliveryResults);
    }
}
