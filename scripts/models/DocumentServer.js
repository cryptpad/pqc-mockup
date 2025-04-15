class DocumentServer {
    constructor(users) {
        this.users = users;
        this.blocks = [];
    }

    /*
    async broadcastBlock(block) {
        this.blocks.push(block);

        // Only send to the intended recipient (Might change after looking at CryptPad code)
        const recipient = this.users.find(user => user.id === block.recipientId);

        if (recipient) {
            console.log(`Sending block from User ${block.userId} to User ${recipient.id}`);
            const result = await recipient.verifyAndDecryptBlock(block);
            console.log(
                `[User ${recipient.id}] verified from User ${block.userId}: ` +
                `sig=${result.signatureValid}, decrypt=${result.decryptionValid}, ` +
                `combined=${result.valid} in ${result.time.toFixed(2)}ms`
            );
        } else {
            console.error(`No recipient found with ID ${block.recipientId}`);
        }
    }*/

    async broadcastSharedBlock(block, recipientIds) {
        this.blocks.push(block); // Store the block

        const startTime = performance.now();

        // Check if recipientIds is provided correctly
        if (!recipientIds || !Array.isArray(recipientIds)) {
            console.error("Invalid recipientIds provided to broadcastSharedBlock:", recipientIds);
            return { time: 0, successCount: 0, totalRecipients: 0 };
        }

        const deliveryPromises = recipientIds.map(async recipientId => {
            const recipient = this.users.find(u => u.id === recipientId);

            if (!recipient) {
                console.warn(`Recipient user ${recipientId} not found`);
                return false;
            }

            try {
                // Since the block already contains encrypted versions for all recipients,
                // we just need to notify each recipient to process their version
                const result = await recipient.decryptSharedBlock(block);

                if (result && result.valid) {
                    console.log(`[User ${recipientId}] received shared block from User ${block.userId}: decryption successful`);
                    return true;
                } else {
                    console.error(`User ${recipientId} could not decrypt the block: ${result?.error || 'Unknown error'}`);
                    return false;
                }
            } catch (error) {
                console.error(`Error delivering to User ${recipientId}:`, error);
                return false;
            }
        });

        const results = await Promise.all(deliveryPromises);
        const successCount = results.filter(Boolean).length;

        const endTime = performance.now();

        return {
            time: endTime - startTime,
            successCount,
            totalRecipients: recipientIds.length
        };
    }
}

export {DocumentServer};