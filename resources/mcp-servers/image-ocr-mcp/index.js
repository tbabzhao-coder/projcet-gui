#!/usr/bin/env node

/**
 * Image OCR MCP Server
 *
 * Provides OCR capabilities for images using Tesseract.js
 * Supports: PNG, JPG, JPEG, BMP, TIFF, WebP
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createWorker } from 'tesseract.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

// Create MCP server
const server = new Server(
  {
    name: 'image-ocr-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const TOOLS = [
  {
    name: 'ocr_image',
    description: 'Extract text from an image using OCR (Optical Character Recognition). Supports PNG, JPG, JPEG, BMP, TIFF, WebP formats.',
    inputSchema: {
      type: 'object',
      properties: {
        image_path: {
          type: 'string',
          description: 'Absolute path to the image file',
        },
        language: {
          type: 'string',
          description: 'Language code for OCR (e.g., "eng" for English, "chi_sim" for Simplified Chinese, "jpn" for Japanese). Default is "eng".',
          default: 'eng',
        },
        psm: {
          type: 'number',
          description: 'Page segmentation mode (0-13). Default is 3 (Fully automatic page segmentation). Use 6 for uniform block of text, 11 for sparse text.',
          default: 3,
        },
      },
      required: ['image_path'],
    },
  },
  {
    name: 'ocr_image_with_confidence',
    description: 'Extract text from an image with confidence scores for each word. Useful for quality assessment.',
    inputSchema: {
      type: 'object',
      properties: {
        image_path: {
          type: 'string',
          description: 'Absolute path to the image file',
        },
        language: {
          type: 'string',
          description: 'Language code for OCR. Default is "eng".',
          default: 'eng',
        },
        min_confidence: {
          type: 'number',
          description: 'Minimum confidence threshold (0-100). Words below this confidence will be marked. Default is 60.',
          default: 60,
        },
      },
      required: ['image_path'],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'ocr_image') {
      return await handleOcrImage(args);
    } else if (name === 'ocr_image_with_confidence') {
      return await handleOcrImageWithConfidence(args);
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Handle OCR image extraction
 */
async function handleOcrImage(args) {
  const { image_path, language = 'eng', psm = 3 } = args;

  // Validate image path
  if (!existsSync(image_path)) {
    throw new Error(`Image file not found: ${image_path}`);
  }

  // Create Tesseract worker
  const worker = await createWorker(language);

  try {
    // Set page segmentation mode
    await worker.setParameters({
      tessedit_pageseg_mode: psm,
    });

    // Perform OCR
    const { data } = await worker.recognize(image_path);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            text: data.text,
            confidence: data.confidence,
            language: language,
            image_path: image_path,
          }, null, 2),
        },
      ],
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Handle OCR with confidence scores
 */
async function handleOcrImageWithConfidence(args) {
  const { image_path, language = 'eng', min_confidence = 60 } = args;

  // Validate image path
  if (!existsSync(image_path)) {
    throw new Error(`Image file not found: ${image_path}`);
  }

  // Create Tesseract worker
  const worker = await createWorker(language);

  try {
    // Perform OCR
    const { data } = await worker.recognize(image_path);

    // Process words with confidence
    const words = data.words.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: word.bbox,
      low_confidence: word.confidence < min_confidence,
    }));

    // Calculate statistics
    const avgConfidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length;
    const lowConfidenceCount = words.filter(w => w.low_confidence).length;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            text: data.text,
            overall_confidence: data.confidence,
            average_word_confidence: avgConfidence,
            total_words: words.length,
            low_confidence_words: lowConfidenceCount,
            words: words,
            language: language,
            image_path: image_path,
          }, null, 2),
        },
      ],
    };
  } finally {
    await worker.terminate();
  }
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Image OCR MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
