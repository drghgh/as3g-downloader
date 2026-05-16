const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Path handling for yt-dlp and ffmpeg
const isWin = process.platform === 'win32';
const YTDLP_PATH = isWin ? path.join(__dirname, 'backend', 'yt-dlp.exe') : 'yt-dlp';
const FFMPEG_PATH = isWin ? path.join(__dirname, 'backend', 'ffmpeg.exe') : 'ffmpeg';

app.get('/api/info', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const args = ['--dump-json', '--no-playlist', url];
    const process = spawn(YTDLP_PATH, args);

    let output = '';
    let errorOutput = '';

    process.stdout.on('data', (data) => output += data.toString());
    process.stderr.on('data', (data) => errorOutput += data.toString());

    process.on('close', (code) => {
        if (code !== 0) {
            console.error('yt-dlp error:', errorOutput);
            return res.status(500).json({ error: 'Failed to fetch video info' });
        }
        try {
            const info = JSON.parse(output);
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
            res.status(500).json({ error: 'Failed to parse video info' });
        }
    });
});

app.get('/api/download', (req, res) => {
    const { url, format = 'best', quality = 'max' } = req.query;
    if (!url) return res.status(400).send('URL is required');

    console.log(`Downloading: ${url} (Quality: ${quality})`);

    const infoProcess = spawn(YTDLP_PATH, ['--get-filename', '-o', '%(title)s.%(ext)s', url]);
    let filename = 'media.mp4';
    infoProcess.stdout.on('data', (data) => filename = data.toString().trim());

    infoProcess.on('close', () => {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        
        const args = [
            '--no-playlist',
            '--ffmpeg-location', isWin ? path.join(__dirname, 'backend') : '/usr/bin',
            '--buffer-size', '16K',
            '--concurrent-fragments', '5',
            '-o', '-',
            url
        ];

        if (format === 'audio') {
            res.setHeader('Content-Type', 'audio/mpeg');
            args.push('-f', 'bestaudio');
            args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
        } else {
            res.setHeader('Content-Type', 'video/mp4');
            
            // Dynamic quality selection
            let f = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
            
            if (quality !== 'max') {
                const height = quality.replace('p', '');
                // Try to get the specific height or lower, preferring mp4
                f = `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]/best`;
            }
            
            args.push('-f', f);
            // Streaming fix for merged mp4
            args.push('--downloader-args', 'ffmpeg:-movflags frag_keyframe+empty_moov');
        }

        const downloadProcess = spawn(YTDLP_PATH, args);
        downloadProcess.stdout.pipe(res);

        downloadProcess.on('close', (code) => {
            if (code !== 0) console.error(`Download failed with code ${code}`);
        });

        req.on('close', () => downloadProcess.kill());
    });
});

// Handle SPA routing: return index.html for any unknown paths
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
