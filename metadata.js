const fs = require('fs').promises;
const path = require('path');

class MetadataManager {
    constructor(metadataDir) {
        this.metadataDir = metadataDir;
    }

    // Get metadata file path for an image
    getMetadataPath(imageRelativePath) {
        const metadataFileName = `${Buffer.from(imageRelativePath).toString('base64')}.json`;
        return path.join(this.metadataDir, metadataFileName);
    }

    // Save metadata for an image
    async saveMetadata(imageRelativePath, metadata) {
        try {
            const metadataPath = this.getMetadataPath(imageRelativePath);
            const data = {
                ...metadata,
                lastUpdated: new Date().toISOString(),
                imagePath: imageRelativePath
            };
            
            await fs.writeFile(metadataPath, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.warn(`Failed to save metadata for ${imageRelativePath}:`, error.message);
            return false;
        }
    }

    // Load metadata for an image
    async loadMetadata(imageRelativePath) {
        try {
            const metadataPath = this.getMetadataPath(imageRelativePath);
            const data = await fs.readFile(metadataPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // Return default metadata if file doesn't exist
            return {
                imagePath: imageRelativePath,
                tags: [],
                description: '',
                rating: 0,
                lastUpdated: null
            };
        }
    }

    // Update metadata for an image
    async updateMetadata(imageRelativePath, updates) {
        try {
            const existingMetadata = await this.loadMetadata(imageRelativePath);
            const updatedMetadata = {
                ...existingMetadata,
                ...updates,
                lastUpdated: new Date().toISOString()
            };
            
            return await this.saveMetadata(imageRelativePath, updatedMetadata);
        } catch (error) {
            console.warn(`Failed to update metadata for ${imageRelativePath}:`, error.message);
            return false;
        }
    }

    // Get all metadata files
    async getAllMetadata() {
        try {
            const files = await fs.readdir(this.metadataDir);
            const metadataFiles = files.filter(file => file.endsWith('.json'));
            
            const allMetadata = {};
            
            for (const file of metadataFiles) {
                try {
                    const data = await fs.readFile(path.join(this.metadataDir, file), 'utf8');
                    const metadata = JSON.parse(data);
                    if (metadata.imagePath) {
                        allMetadata[metadata.imagePath] = metadata;
                    }
                } catch (error) {
                    console.warn(`Failed to read metadata file ${file}:`, error.message);
                }
            }
            
            return allMetadata;
        } catch (error) {
            console.warn('Failed to read metadata directory:', error.message);
            return {};
        }
    }

    // Delete metadata for an image
    async deleteMetadata(imageRelativePath) {
        try {
            const metadataPath = this.getMetadataPath(imageRelativePath);
            await fs.unlink(metadataPath);
            return true;
        } catch (error) {
            console.warn(`Failed to delete metadata for ${imageRelativePath}:`, error.message);
            return false;
        }
    }

    // Search images by metadata
    async searchByMetadata(query) {
        const allMetadata = await this.getAllMetadata();
        const results = [];
        
        const searchTerm = query.toLowerCase();
        
        for (const [imagePath, metadata] of Object.entries(allMetadata)) {
            const matches = [
                // Search in tags
                metadata.tags && metadata.tags.some(tag => 
                    tag.toLowerCase().includes(searchTerm)
                ),
                // Search in description
                metadata.description && 
                metadata.description.toLowerCase().includes(searchTerm),
                // Search in image path/name
                imagePath.toLowerCase().includes(searchTerm)
            ].some(match => match);
            
            if (matches) {
                results.push({
                    imagePath,
                    metadata
                });
            }
        }
        
        return results;
    }
}

module.exports = MetadataManager;