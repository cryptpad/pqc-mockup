export class Document {
    constructor(id){
        this.id = id;
        this.editors = new Set();
        this.edits = 0;
    }

    addEditor(userId){
        this.editors.add(userId);
    }

    incrementEdits(){
        this.edits++;
    }
}
