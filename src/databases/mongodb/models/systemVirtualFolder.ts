/**
 * @file src/databases/mongodb/models/systemVirtualFolder.ts
 * @description MongoDB schema and model for System Virtual Folders.
 *
 * This module defines a schema and model for virtual folders in the system.
 * Virtual folders are used to organize content in a hierarchical structure.
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { SystemVirtualFolder } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// System virtual folder schema
export const systemVirtualFolderSchema = new Schema(
    {
        _id: { type: String, required: true },
        name: { type: String, required: true },
        path: { type: String, required: true, unique: true },
        parent: { type: String, ref: 'SystemVirtualFolder' },
        icon: { type: String, default: 'bi:folder' },
        order: { type: Number, default: 0 },
        type: { type: String, enum: ['folder', 'collection'], required: true },
        metadata: Schema.Types.Mixed,
        updatedAt: { type: Date, default: Date.now }
    },
    {
        timestamps: true,
        collection: 'system_virtual_folders',
        strict: false
    }
);

// Add indexes
// systemVirtualFolderSchema.index({ path: 1 }, { unique: true });
systemVirtualFolderSchema.index({ parent: 1 });
systemVirtualFolderSchema.index({ type: 1 });
systemVirtualFolderSchema.index({ order: 1 });

// Static methods
systemVirtualFolderSchema.statics = {
    // Create virtual folder
    async createVirtualFolder(folderData: {
        name: string;
        parent?: string;
        path: string;
        icon?: string;
        order?: number;
        type: 'folder' | 'collection';
        metadata?: any;
    }): Promise<Document> {
        try {
            const folder = new this(folderData);
            await folder.save();
            logger.info(`Created virtual folder: ${folderData.path}`);
            return folder;
        } catch (error) {
            logger.error(`Error creating virtual folder: ${error.message}`);
            throw error;
        }
    },

    // Get all virtual folders
    async getAllVirtualFolders(): Promise<Document[]> {
        try {
            const folders = await this.find().sort({ order: 1 }).exec();
            logger.debug(`Retrieved ${folders.length} virtual folders`);
            return folders;
        } catch (error) {
            logger.error(`Error retrieving virtual folders: ${error.message}`);
            throw error;
        }
    },

    // Get virtual folder by path
    async getVirtualFolderByPath(path: string): Promise<Document | null> {
        try {
            const folder = await this.findOne({ path }).exec();
            logger.debug(`Retrieved virtual folder: ${path}`);
            return folder;
        } catch (error) {
            logger.error(`Error retrieving virtual folder: ${error.message}`);
            throw error;
        }
    },

    // Get children of a virtual folder
    async getVirtualFolderChildren(parentPath: string): Promise<Document[]> {
        try {
            const folders = await this.find({
                path: new RegExp(`^${parentPath}/[^/]+$`)
            }).sort({ order: 1 }).exec();
            logger.debug(`Retrieved ${folders.length} children for path: ${parentPath}`);
            return folders;
        } catch (error) {
            logger.error(`Error retrieving virtual folder children: ${error.message}`);
            throw error;
        }
    },

    // Update virtual folder
    async updateVirtualFolder(path: string, updateData: Partial<SystemVirtualFolder>): Promise<Document | null> {
        try {
            const folder = await this.findOneAndUpdate(
                { path },
                updateData,
                { new: true }
            ).exec();
            if (folder) {
                logger.info(`Updated virtual folder: ${path}`);
            } else {
                logger.warn(`Virtual folder not found: ${path}`);
            }
            return folder;
        } catch (error) {
            logger.error(`Error updating virtual folder: ${error.message}`);
            throw error;
        }
    },

    // Delete virtual folder
    async deleteVirtualFolder(path: string): Promise<boolean> {
        try {
            const result = await this.findOneAndDelete({ path }).exec();
            if (result) {
                logger.info(`Deleted virtual folder: ${path}`);
                return true;
            }
            logger.warn(`Virtual folder not found for deletion: ${path}`);
            return false;
        } catch (error) {
            logger.error(`Error deleting virtual folder: ${error.message}`);
            throw error;
        }
    },

    // Move virtual folder
    async moveVirtualFolder(sourcePath: string, targetPath: string): Promise<Document | null> {
        try {
            const folder = await this.findOneAndUpdate(
                { path: sourcePath },
                { path: targetPath },
                { new: true }
            ).exec();
            if (folder) {
                logger.info(`Moved virtual folder from ${sourcePath} to ${targetPath}`);
            } else {
                logger.warn(`Virtual folder not found for moving: ${sourcePath}`);
            }
            return folder;
        } catch (error) {
            logger.error(`Error moving virtual folder: ${error.message}`);
            throw error;
        }
    }
};

// Create and export the SystemVirtualFolder model
export const SystemVirtualFolderModel = mongoose.models?.SystemVirtualFolder ||
    mongoose.model<SystemVirtualFolder>('SystemVirtualFolder', systemVirtualFolderSchema);