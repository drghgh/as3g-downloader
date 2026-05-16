const express = require('express');
const cors = require('cors');
const path = require('path');
const { create: createYtDlp } = require('yt-dlp-exec');
const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ytdlp = createYtDlp('/tmp/yt-dlp');

app.get('/api/info', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        const info = await ytdlp(url, {
            dumpJson: true,
            noPlaylist: true
        });

        const resolutions = [...new Set(info.formats
            .filter(f => f.height)
            .map(f => f.height))]
            .sort((a, b) => b - a);

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration_string,
            uploader: info.uploader,
            resolutions: resolutions
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch video info' });
    }
});

app.get('/api/download', async (req, res) => {
    const { url, format = 'best', quality = 'max' } = req.query;
    if (!url) return res.status(400).send('URL is required');

    try {
        const info = await ytdlp(url, { getFilename: true, output: '%(title)s.%(ext)s' });
        const filename = info.trim() || 'media.mp4';
        
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

        const args = [
            '--no-playlist',
            '--ffmpeg-location', ffmpegPath,
            '--buffer-size', '16K',
            '-o', '-',
            url
        ];

        if (format === 'audio') {
            res.setHeader('Content-Type', 'audio/mpeg');
            args.push('-f', 'bestaudio', '--extract-audio', '--audio-format', 'mp3');
        } else {
            res.setHeader('Content-Type', 'video/mp4');
            let f = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
            if (quality !== 'max') {
                const height = quality.replace('p', '');
                f = `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]/best`;
            }
            args.push('-f', f, '--downloader-args', 'ffmpeg:-movflags frag_keyframe+empty_moov');
        }

        const ytdlpBinary = await ytdlp.createBinary();
        const process = spawn(ytdlpBinary, args);
        process.stdout.pipe(res);
        
        req.on('close', () => process.kill());
    } catch (e) {
        console.error(e);
        res.status(500).send('Download failed');
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
