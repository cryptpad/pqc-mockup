class DocumentServer {
    constructor(users) {
        this.users = users;
        this.blocks = [];
    }

    async broadcastBlock(block) {
        this.blocks.push(block);

        // Only send to the intended recipient (Might change after looking at CryptPad code)
        const recipient = this.users.find(user => user.id === block.recipientId);

        if (recipient) {
            console.log(`Sending block from User ${block.userId} to User ${recipient.id}`);
            const result = await recipient.verifyAndDecryptBlock(block);
            console.log(`[User ${recipient.id}] verified from User ${block.userId}: ${result.valid} in ${result.time.toFixed(2)}ms`);
        } else {
            console.error(`No recipient found with ID ${block.recipientId}`);
        }
    }
}

export {DocumentServer};