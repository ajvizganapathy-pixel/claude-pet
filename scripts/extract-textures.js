// Extract and modify textures from GLB to create Garfield-style cat
const fs = require('fs');
const path = require('path');

const glbPath = path.resolve(__dirname, '../assets/character/saber-cat.glb');
const buffer = fs.readFileSync(glbPath);

// Walk through chunks to find textures
let offset = 12; // Skip GLB header
let chunkIndex = 0;

console.log('=== Extracting Textures from GLB ===');

while (offset < buffer.length) {
  const chunkLength = buffer.readUInt32LE(offset);
  const chunkType = buffer.slice(offset + 4, offset + 8).toString('ascii');
  
  if (chunkType === 'JSON' || chunkType === '\x00\x00\x00\x00') {
    const jsonData = buffer.slice(offset + 8, offset + 8 + chunkLength);
    const json = JSON.parse(jsonData.toString('utf8'));
    
    if (json.images && json.textures) {
      console.log('Found images:', json.images.length);
      console.log('Found textures:', json.textures.length);
      
      // Extract PNG images
      for (const [key, image] of Object.entries(json.images)) {
        // Images might be in the JSON chunk or as separate binary chunks
        const imageBuffer = buffer.slice(offset + 8 + chunkLength + parseInt(image.uri || '0'), offset + 8 + chunkLength);
        console.log(`Image ${key}: ${image.mimeType}, uri: ${image.uri || 'embedded'}`);
      }
    }
    
    // Calculate next chunk offset
    const padding = (4 - ((chunkLength + 8) % 4)) % 4;
    offset += 8 + chunkLength + padding;
    chunkIndex++;
  } else {
    offset += 8 + chunkLength;
    chunkIndex++;
    if (chunkIndex > 5) break;
  }
}

// Better approach: parse the GLB properly
console.log('\n=== Proper GLB Parse ===');

// GLB Header: 12 bytes
const magic = buffer.slice(0, 4).toString('ascii');
const version = buffer.readUInt32LE(4);
const length = buffer.readUInt32LE(8);

// Chunk 0: JSON
const chunk0Length = buffer.readUInt32LE(12);
const chunk0Type = buffer.slice(16, 20).toString('ascii');
const jsonChunk = buffer.slice(20, 20 + chunk0Length);
const json = JSON.parse(jsonChunk.toString('utf8'));

console.log('GLB Magic:', magic);
console.log('GLB Version:', version);
console.log('GLB Length:', length);

// Parse textures and images from JSON
if (json.textures && json.images) {
  console.log('\nTextures found:', json.textures.length);
  console.log('Images found:', json.images.length);
  
  // Find texture data in binary chunk
  const binaryChunkOffset = 20 + chunk0Length + ((4 - ((chunk0Length + 8) % 4)) % 4);
  const binaryChunkLength = buffer.readUInt32LE(binaryChunkOffset);
  const binaryDataStart = binaryChunkOffset + 8;
  
  console.log('Binary chunk at offset:', binaryChunkOffset);
  console.log('Binary chunk length:', binaryChunkLength);
  
  // Extract PNG images
  for (let i = 0; i < json.images.length; i++) {
    const image = json.images[i];
    if (image.uri && image.uri.startsWith('data:')) {
      // Embedded base64 data
      const matches = image.uri.match(/^data:(image\/\w+);base64,(.+)$/);
      if (matches) {
        const imageData = Buffer.from(matches[2], 'base64');
        const outputPath = path.join(__dirname, `texture_${i}.png`);
        fs.writeFileSync(outputPath, imageData);
        console.log(`Extracted texture_${i}.png (${imageData.length} bytes) -> ${outputPath}`);
        console.log(`Image dimensions can be analyzed separately.`);
      }
    } else if (image.bufferView !== undefined && json.bufferViews) {
      // Image is in buffer view
      const bv = json.bufferViews[image.bufferView];
      const byteOffset = (json.buffers[0].uri ? 0 : 0) + (bv.byteOffset || 0) + binaryDataStart;
      const imageData = buffer.slice(byteOffset, byteOffset + bv.byteLength);
      const outputPath = path.join(__dirname, `texture_${i}.png`);
      fs.writeFileSync(outputPath, imageData);
      console.log(`Extracted texture_${i}.png (${imageData.length} bytes) -> ${outputPath}`);
    }
  }
}

console.log('\n=== Next Steps ===');
console.log('After reviewing the extracted textures, we will:');
console.log('1. Create Garfield-style orange/red fur texture');
console.log('2. Add characteristic Garfield markings (orange with tan/brown stripes)');
console.log('3. Keep eye textures intact (cat eyes)');
console.log('4. Rebuild the GLB with modified textures');
console.log('5. Test the model in the companion');

// Analyze PNG headers to get dimensions
console.log('\n=== Texture Dimensions ===');
for (let i = 0; i < 3; i++) {
  const texPath = path.join(__dirname, `texture_${i}.png`);
  if (fs.existsSync(texPath)) {
    const data = fs.readFileSync(texPath);
    if (data.length >= 24 && data.slice(0, 4).toString('ascii') === '\x89PNG') {
      const width = data.readUInt32BE(16);
      const height = data.readUInt32BE(20);
      const type = data.readUInt32BE(12).toString('ascii');
      console.log(`texture_${i}.png: ${width}x${height}, type=${type === 'IHDR' ? 'Valid PNG' : 'Unknown'}`);
    }
  }
}