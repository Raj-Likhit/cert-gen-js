/**
 * renderWorker.js
 * Handles heavy certificate rendering off the main thread.
 */

self.onmessage = async function(e) {
    const { templateArrayBuffer, nameText, config } = e.data;

    try {
        if (!templateArrayBuffer || templateArrayBuffer.byteLength === 0) {
            throw new Error('Template image data is empty or missing.');
        }

        // ── 1. Create ImageBitmap from template raw bytes ──
        let imgBitmap;
        try {
            imgBitmap = await createImageBitmap(new Blob([templateArrayBuffer]));
        } catch (bitmapErr) {
            throw new Error(`Failed to decode template image: ${bitmapErr.message}`);
        }

        // ── 2. Initialize Canvas with correct dimensions ──
        // Defensive check: ensure dimensions are valid integers > 0
        const width = Math.floor(Number(imgBitmap.width)) || 2000;
        const height = Math.floor(Number(imgBitmap.height)) || 1414;

        if (width <= 0 || height <= 0) {
            throw new Error(`Invalid image dimensions: ${width}x${height}`);
        }

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgBitmap, 0, 0);

        // ── 4. Typography Configuration ──
        let fontStyle = '';
        if (config.fontItalic) fontStyle += 'italic ';
        if (config.fontWeight === 'bold') fontStyle += 'bold ';

        const fontSize = Math.floor(Number(config.fontSize)) || 60;
        ctx.font = `${fontStyle}${fontSize}px ${config.fontFamily}`;
        ctx.fillStyle = config.fontColor;
        ctx.textAlign = config.textAlign || 'center';

        // ── 5. Text Transformation ──
        let finalName = nameText || '';
        if (config.textCase === 'uppercase') finalName = finalName.toUpperCase();
        else if (config.textCase === 'lowercase') finalName = finalName.toLowerCase();
        else if (config.textCase === 'titlecase') {
            finalName = finalName.split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
        }

        // ── 6. Rendering (Stroke + Fill) ──
        const x = Math.floor(Number(config.nameX)) || 0;
        const y = Math.floor(Number(config.nameY)) || 0;

        if (Number(config.strokeWidth) > 0) {
            ctx.strokeStyle = config.strokeColor;
            ctx.lineWidth = Number(config.strokeWidth);
            ctx.lineJoin = 'round';
            ctx.strokeText(finalName, x, y);
        }
        ctx.fillText(finalName, x, y);

        // ── 7. Respond with Result ──
        const resultBlob = await canvas.convertToBlob({ type: 'image/png' });
        
        self.postMessage({ 
            success: true, 
            blob: resultBlob,
            width: Math.floor(width),
            height: Math.floor(height)
        });

    } catch (error) {
        console.error('Worker Error Internal:', error);
        self.postMessage({ success: false, error: `${error.name}: ${error.message}` });
    }
};
