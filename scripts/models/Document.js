export class Document {
    constructor(id) {
        this.id = id;
        this.editors = new Set();
        this.edits = 0;
        this.editsByUser = [];
    }

    addEditor(userId) {
        this.editors.add(userId);
    }

    incrementEdits(userId) { // Update to accept userId parameter
        this.edits++;

        const userRecord = this.editsByUser.find(entry => entry.userId === userId);
        if (userRecord) {
            userRecord.edits++;
        } else {
            this.editsByUser.push({
                userId: userId,
                edits: 1
            });
        }
    }
}