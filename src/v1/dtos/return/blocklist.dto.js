class BlocklistDTO {
  constructor(blocklist) {
    this.id = blocklist._id;
    this.doc_number = blocklist.doc_number;
    this.account_id = blocklist.account_id;
    this.source = blocklist.source;
    this.block_type = blocklist.block_type;
    this.name = blocklist.name;
    this.created_at = blocklist.created_at;
    this.updated_at = blocklist.updated_at;
  }

  // Static method to transform multiple blocklist entries
  static fromArray(blocklistEntries) {
    return blocklistEntries.map(entry => new BlocklistDTO(entry));
  }

  // Static method to transform single blocklist entry
  static fromObject(blocklist) {
    return new BlocklistDTO(blocklist);
  }
}

module.exports = BlocklistDTO;
