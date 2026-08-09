// Replace textures in the GLB file with Garfield/Puss versions
const fs = require('fs');
const path = require('path');

const scriptsDir = path.dirname(__filename);
const glbPath = path.resolve(scriptsDir, '../assets/character/saber-cat.glb');
const outputPath = path.resolve(scriptsDir, '../assets/character/garfield-cat.glb');

// Texture files to embed
const furTexturePath = path.join(scriptsDir, 'garfield-fur.png');
const eyeTexturePath = path.join(scriptsDir, 'garfield-eyes.png');

console.log('=== Replacing Textures in GLB ===\n');

// Read the original GLB
const buffer = fs.readFileSync(glbPath);

// Parse GLB structure
const jsonLength = buffer.readUInt32LE(12);
const jsonStr = buffer.slice(20, 20 + jsonLength).toString('utf8');
const gltf = JSON.parse(jsonStr);

console.log('Original GLB parsed:');
console.log(`  JSON length: ${jsonLength}`);
console.log(`  Images: ${gltf.images.length}`);
console.log(`  Textures: ${gltf.textures.length}`);

// Read new texture files
const furBuffer = fs.readFileSync(furTexturePath);
const eyeBuffer = fs.readFileSync(eyeTexturePath);

console.log(`\nNew textures:`);
console.log(`  Garfield fur: ${furBuffer.length} bytes`);
console.log(`  Garfield eyes: ${eyeBuffer.length} bytes`);

// Find which image is used by which material
// Check textures and materials
gltf.textures.forEach((tex, i) => {
  console.log(`\nTexture ${i}: source=${tex.source}`);
});

// Update images to embed the new textures
gltf.images[1].uri = undefined; // Remove embedded base64 URI if present
gltf.images[1].bufferView = undefined; // Will set new buffer view

// We need to add these to bufferViews and update the binary chunk
// For simplicity, let's embed them as base64 URIs in the JSON

const furBase64 = furBuffer.toString('base64');
const eyeBase64 = eyeBuffer.toString('base64');

// Update images with new base64 data
// Image 0 = eyes, Image 1 = fur (based on sizes)
if (eyeBuffer.length < furBuffer.length) {
  gltf.images[0].uri = `data:image/png;base64,${eyeBase64}`;
  gltf.images[1].uri = `data:image/png;base64,${furBase64}`;
  console.log('\n✅ Updated images: [0]=eyes, [1]=fur');
} else {
  gltf.images[0].uri = `data:image/png;base64,${furBase64}`;
  gltf.images[1].uri = `data:image/png;base64,${eyeBase64}`;
  console.log('\n✅ Updated images: [0]=fur, [1]=eyes');
}

// Also update material base colors to enhance Garfield look
gltf.materials.forEach(mat => {
  const name = mat.name || '';
  console.log(`\nMaterial "${name}":`);
  
  if (name === 'SaberFur' || name.includes('Fur')) {
    // Change fur material to orange
    if (mat.pbrMetallicRoughness) {
      mat.pbrMetallicRoughness.baseColorFactor = [1.0, 0.43, 0.2, 1.0]; // Garfield orange
      console.log('  → Changed base color to Garfield orange');
    }
  } else if (name === 'SaberDetailDark' || name.includes('Detail')) {
    // Change detail material to brown
    if (mat.pbrMetallicRoughness) {
      mat.pbrMetallicRoughness.baseColorFactor = [0.35, 0.23, 0.12, 1.0]; // Brown stripes
      console.log('  → Changed base color to stripe brown');
    }
  } else if (name === 'SaberEye' || name === 'Eye') {
    // Keep or enhance eye color
    if (mat.pbrMetallicRoughness) {
      mat.pbrMetallicRoughness.baseColorFactor = [0.4, 0.78, 0.25, 1.0]; // Green eyes
      console.log('  → Changed eye color to green (cat eyes)');
    }
  }
});

// Serialize updated JSON
const newJsonStr = JSON.stringify(gltf);
const newJsonBuffer = Buffer.from(newJsonStr, 'utf8');

// GLB needs 4-byte alignment for chunks
const padding = (4 - ((newJsonBuffer.length + 8) % 4)) % 4;
const paddedJson = Buffer.alloc(newJsonBuffer.length + padding);
newJsonBuffer.copy(paddedJson);

// Rebuild GLB
// Header: magic (4) + version (4) + length (4) = 12 bytes
// Chunk 0: length (4) + type (4) + data (JSON, padded)
// Chunk 1: length (4) + type (4) + data (binary)

const binaryChunkOffset = 20 + paddedJson.length;
const binaryChunkLength = buffer.readUInt32LE(binaryChunkOffset);
const binaryData = buffer.slice(binaryChunkOffset + 8, binaryChunkOffset + 8 + binaryChunkLength);

const newTotalLength = 12 + 8 + paddedJson.length + 8 + binaryData.length;

const newBuffer = Buffer.alloc(newTotalLength);
// Header
Buffer.from('glTF').copy(newBuffer, 0);
newBuffer.writeUInt32LE(2, 4); // Version
newBuffer.writeUInt32LE(newTotalLength, 8); // Total length

// JSON Chunk
newBuffer.writeUInt32LE(paddedJson.length, 12);
Buffer.from('JSON').copy(newBuffer, 16);
paddedJson.copy(newBuffer, 20);

// Binary Chunk
const binaryStart = 20 + paddedJson.length;
newBuffer.writeUInt32LE(binaryData.length, binaryStart);
Buffer.from('BIN\x00').copy(newBuffer, binaryStart + 4);
binaryData.copy(newBuffer, binaryStart + 8);

// Write output file
fs.writeFileSync(outputPath, newBuffer);

console.log(`\n✅ WROTE: ${outputPath}`);
console.log(`   Size: ${newBuffer.length} bytes`);
console.log(`   JSON: ${paddedJson.length} bytes`);
console.log(`   Binary: ${binaryData.length} bytes`);

// Also create a Puss version
const pussFurBuffer = fs.readFileSync(path.join(scriptsDir, 'puss-fur.png'));
const pussEyeBuffer = fs.readFileSync(path.join(scriptsDir, 'puss-eyes.png'));

const garfield = JSON.parse(jsonStr); // Fresh copy

garfield.images[0].uri = `data:image/png;base64,${pussEyeBuffer.toString('base64')}`;
garfield.images[1].uri = `data:image/png;base64,${pussFurBuffer.toString('base64')}`;

// Update materials for Puss (black with white chest)
garfield.materials.forEach(mat => {
  const name = mat.name || '';
  if (name === 'SaberFur') {
    mat.pbrMetallicRoughness.baseColorFactor = [0.12, 0.12, 0.12, 1.0]; // Black
  } else if (name === 'SaberDetailDark') {
    mat.pbrMetallicRoughness.baseColorFactor = [0.96, 0.96, 0.96, 1.0]; // White chest
  } else if (name === 'SaberEye') {
    mat.pbrMetallicRoughness.baseColorFactor = [0.2, 0.5, 0.2, 1.0]; // Dark green eyes
  }
});

const pussJson = Buffer.from(JSON.stringify(garfield));
const pussPadding = (4 - ((pussJson.length + 8) % 4)) % 4;
const pussPadded = Buffer.alloc(pussJson.length + pussPadding);
pussJson.copy(pussPadded);

const pussTotal = 12 + 8 + pussPadded.length + 8 + binaryData.length;
const pussBuffer = Buffer.alloc(pussTotal);

Buffer.from('glTF').copy(pussBuffer, 0);
pussBuffer.writeUInt32LE(2, 4);
pussBuffer.writeUInt32LE(pussTotal, 8);

pussBuffer.writeUInt32LE(pussPadded.length, 12);
Buffer.from('JSON').copy(pussBuffer, 16);
pussPadded.copy(pussBuffer, 20);

const pussBinaryStart = 20 + pussPadded.length;
pussBuffer.writeUInt32LE(binaryData.length, pussBinaryStart);
Buffer.from('BIN\x00').copy(pussBuffer, pussBinaryStart + 4);
binaryData.copy(pussBuffer, pussBinaryStart + 8);

const pussOutput = path.resolve(scriptsDir, '../assets/character/puss-cat.glb');
fs.writeFileSync(pussOutput, pussBuffer);

console.log(`\n✅ Also created Puss version: ${pussOutput}`);
console.log(`   Size: ${pussBuffer.length} bytes`);

console.log('\n=== Textures replaced successfully! ===');
console.log('\nNew files created:');
console.log('  1. garfield-cat.glb - Orange Garfield-style cat');
console.log('  2. puss-cat.glb - Black cat with white chest (Puss in Boots style)');
console.log('\nTo use: Update companionScene3d.ts to load garfield-cat.glb or puss-cat.glb');