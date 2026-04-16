/**
 * renderWorker.js
 * Handles heavy certificate rendering off the main thread to ensure UI stability.
 */

self.onmessage = async function(e) {
    const { templateBase64, nameText, config, width, height } = e.data;

    try {
        // Create OffscreenCanvas
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Load Template Image
        const response = await fetch(templateBase64);
        const blob = await response.blob();
        const imgBitmap = await createImageBitmap(blob);

        // Draw Template
        ctx.drawImage(imgBitmap, 0, 0);

        // Configure Font
        let fontStyle = '';
        if (config.fontItalic) fontStyle += 'italic ';
        if (config.fontBold) fontStyle += 'bold ';
        
        ctx.font = `${fontStyle}${config.fontSize}px ${config.fontFamily}`;
        ctx.fillStyle = config.fontColor;
        ctx.textAlign = 'center';

        // Draw Stroke if needed
        if (config.strokeWidth > 0) {
            ctx.strokeStyle = config.strokeColor;
            ctx.lineWidth = config.strokeWidth;
            ctx.lineJoin = 'round';
            ctx.strokeText(nameText, config.nameX, config.nameY);
        }

        // Draw Text
        ctx.fillText(nameText, config.nameX, config.nameY);

        // Extract Result
        const resultBlob = await canvas.convertToBlob({ type: 'image/png' });
        
        // Send back
        self.postMessage({ success: true, blob: resultBlob });

    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};
