// Create Garfield-style textures from the Saber-cat textures
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const scriptsDir = path.dirname(__filename);
const furTexturePath = path.join(scriptsDir, 'texture_1.png');  // Fur texture (large)
const eyeTexturePath = path.join(scriptsDir, 'texture_0.png');  // Eye texture (small)

async function createGarfieldTextures() {
  console.log('=== Creating Garfield-Style Textures ===\n');

  try {
    // 1. Process FUR texture - transform to orange Garfield style
    console.log('Processing fur texture...');
    
    const furImage = sharp(furTexturePath);
    const furMeta = await furImage.metadata();
    console.log(`Fur texture: ${furMeta.width}x${furMeta.height}, ${furMeta.channels} channels`);

    // Get raw pixels with alpha
    const furRaw = await furImage
      .ensureAlpha()
      .toFormat('raw')
      .toBuffer({ resolveWithObject: true });
    
    console.log(`Fur raw data: ${furRaw.data.length} bytes, channels: ${furRaw.info.channels}, width: ${furRaw.info.width}, height: ${furRaw.info.height}`);

    const width = furRaw.info.width;
    const height = furRaw.info.height;
    const channels = 4; // RGBA

    console.log(`Processing ${width}x${height} pixels with ${channels} channels...`);

    const garfieldFur = Buffer.alloc(furRaw.data.length);

    for (let i = 0; i < furRaw.data.length; i += channels) {
      if (i + 3 >= furRaw.data.length) break;
      
      const r = furRaw.data[i];
      const g = furRaw.data[i + 1];
      const b = furRaw.data[i + 2];
      const a = furRaw.data[i + 3];

      if (a === 0) {
        // Transparent pixel
        garfieldFur[i] = 0;
        garfieldFur[i + 1] = 0;
        garfieldFur[i + 2] = 0;
        garfieldFur[i + 3] = 0;
      } else {
        // Determine brightness for color mapping
        const brightness = (r + g + b) / 3;

        if (brightness > 200) {
          // Light areas -> Orange fur (#FF6B35)
          garfieldFur[i] = 255;     // R
          garfieldFur[i + 1] = 107; // G
          garfieldFur[i + 2] = 53;  // B
        } else if (brightness > 150) {
          // Medium-light -> Medium orange (#FF9E4D)
          garfieldFur[i] = 255;
          garfieldFur[i + 1] = 158;
          garfieldFur[i + 2] = 79;
        } else if (brightness > 100) {
          // Medium -> Tan/belly (#FFB07A)
          garfieldFur[i] = 255;
          garfieldFur[i + 1] = 180;
          garfieldFur[i + 2] = 120;
        } else if (brightness > 50) {
          // Dark -> Brown stripes (#8D5A32)
          garfieldFur[i] = 141;
          garfieldFur[i + 1] = 90;
          garfieldFur[i + 2] = 50;
        } else {
          // Very dark -> Dark brown stripes (#5D3A1A)
          garfieldFur[i] = 93;
          garfieldFur[i + 1] = 58;
          garfieldFur[i + 2] = 26;
        }
        garfieldFur[i + 3] = a;
      }
    }

    // Save Garfield fur texture
    await sharp(garfieldFur, {
      raw: {
        width: width,
        height: height,
        channels: channels
      }
    }).png().toFile(path.join(scriptsDir, 'garfield-fur.png'));

    console.log('✅ Saved garfield-fur.png');

    // 2. Process EYE texture - make them green/yellow cat eyes
    console.log('\nProcessing eye texture...');

    const eyeImage = sharp(eyeTexturePath);
    const eyeMeta = await eyeImage.metadata();
    console.log(`Eye texture: ${eyeMeta.width}x${eyeMeta.height}, ${eyeMeta.channels} channels`);

    const eyeRaw = await eyeImage
      .ensureAlpha()
      .toFormat('raw')
      .toBuffer({ resolveWithObject: true });

    console.log(`Eye raw data: ${eyeRaw.data.length} bytes`);

    const eyeWidth = eyeRaw.info.width;
    const eyeHeight = eyeRaw.info.height;
    const eyeChannels = 4;

    const garfieldEyes = Buffer.alloc(eyeRaw.data.length);

    for (let i = 0; i < eyeRaw.data.length; i += eyeChannels) {
      if (i + 3 >= eyeRaw.data.length) break;
      
      const r = eyeRaw.data[i];
      const g = eyeRaw.data[i + 1];
      const b = eyeRaw.data[i + 2];
      const a = eyeRaw.data[i + 3];

      if (a === 0) {
        garfieldEyes[i] = 0;
        garfieldEyes[i + 1] = 0;
        garfieldEyes[i + 2] = 0;
        garfieldEyes[i + 3] = 0;
      } else {
        const brightness = (r + g + b) / 3;

        if (brightness > 200) {
          // White -> Yellow-green center (#FFC832)
          garfieldEyes[i] = 255;
          garfieldEyes[i + 1] = 200;
          garfieldEyes[i + 2] = 50;
        } else if (brightness > 150) {
          // Medium -> Green (#64C83C)
          garfieldEyes[i] = 100;
          garfieldEyes[i + 1] = 200;
          garfieldEyes[i + 2] = 60;
        } else {
          // Dark -> Dark green/black outline (#28501E)
          garfieldEyes[i] = 40;
          garfieldEyes[i + 1] = 80;
          garfieldEyes[i + 2] = 30;
        }
        garfieldEyes[i + 3] = a;
      }
    }

    await sharp(garfieldEyes, {
      raw: {
        width: eyeWidth,
        height: eyeHeight,
        channels: eyeChannels
      }
    }).png().toFile(path.join(scriptsDir, 'garfield-eyes.png'));

    console.log('✅ Saved garfield-eyes.png');

    // 3. Also create alternative Puss in Boots texture (black cat with white chest)
    const pussFur = Buffer.alloc(furRaw.data.length);

    for (let i = 0; i < furRaw.data.length; i += channels) {
      if (i + 3 >= furRaw.data.length) break;
      
      const r = furRaw.data[i];
      const g = furRaw.data[i + 1];
      const b = furRaw.data[i + 2];
      const a = furRaw.data[i + 3];

      if (a === 0) {
        pussFur[i] = 0; pussFur[i + 1] = 0; pussFur[i + 2] = 0; pussFur[i + 3] = 0;
      } else {
        // Map: white -> black, dark areas -> white (inverted for Puss)
        const brightness = (r + g + b) / 3;
        
        if (brightness > 200) {
          // White -> Black fur (Puss in Boots)
          pussFur[i] = 30; pussFur[i + 1] = 30; pussFur[i + 2] = 30;
        } else if (brightness > 150) {
          pussFur[i] = 40; pussFur[i + 1] = 40; pussFur[i + 2] = 40;
        } else if (brightness > 100) {
          // Belly -> White
          pussFur[i] = 245; pussFur[i + 1] = 245; pussFur[i + 2] = 245;
        } else if (brightness > 50) {
          // Dark -> Dark brown (stripes)
          pussFur[i] = 80; pussFur[i + 1] = 80; pussFur[i + 2] = 80;
        } else {
          // Very dark -> Black
          pussFur[i] = 15; pussFur[i + 1] = 15; pussFur[i + 2] = 15;
        }
        pussFur[i + 3] = a;
      }
    }

    await sharp(pussFur, {
      raw: { width, height, channels }
    }).png().toFile(path.join(scriptsDir, 'puss-fur.png'));

    console.log('✅ Saved puss-fur.png');

    // Create Puss eyes (green like Puss in Boots)
    const pussEyes = Buffer.alloc(eyeRaw.data.length);
    for (let i = 0; i < eyeRaw.data.length; i += eyeChannels) {
      if (i + 3 >= eyeRaw.data.length) break;
      const r = eyeRaw.data[i], g = eyeRaw.data[i + 1], b = eyeRaw.data[i + 2], a = eyeRaw.data[i + 3];
      
      if (a === 0) {
        pussEyes[i] = 0; pussEyes[i + 1] = 0; pussEyes[i + 2] = 0; pussEyes[i + 3] = 0;
      } else {
        const brightness = (r + g + b) / 3;
        if (brightness > 200) { // White -> Puss green eyes
          pussEyes[i] = 34; pussEyes[i + 1] = 139; pussEyes[i + 2] = 34;
        } else if (brightness > 100) {
          pussEyes[i] = 60; pussEyes[i + 1] = 179; pussEyes[i + 2] = 60;
        } else {
          pussEyes[i] = 20; pussEyes[i + 1] = 80; pussEyes[i + 2] = 20;
        }
        pussEyes[i + 3] = a;
      }
    }

    await sharp(pussEyes, {
      raw: { width: eyeWidth, height: eyeHeight, channels: eyeChannels }
    }).png().toFile(path.join(scriptsDir, 'puss-eyes.png'));

    console.log('✅ Saved puss-eyes.png');

    console.log('\n=== All textures created! ===');
    console.log('Available style options:');
    console.log('  - Garfield: garfield-fur.png + garfield-eyes.png (orange cat)');
    console.log('  - Puss: puss-fur.png + puss-eyes.png (black cat with white chest)');
    console.log('\nNext: Replace textures in GLB file');

    return true;
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    return false;
  }
}

createGarfieldTextures();