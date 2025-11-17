const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
app.use(express.json());
app.use(cors());

const videoDir = path.resolve(os.tmpdir(), 'downloads');

// Função para escolher o melhor formato de áudio
function chooseBestAudioFormat(formats) {
  const audioOnly = formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');
  if (audioOnly.length === 0) return null;
  return audioOnly.sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0];
}

// Função para executar yt-dlp e retornar JSON
function runYtDlpJson(url) {
  return new Promise((resolve, reject) => {
    const args = ['--dump-json', '--extractor-args', 'youtube:player_client=default', url];
    const ytDlpProcess = spawn('yt-dlp', args);

    let output = '';
    let errorOutput = '';

    ytDlpProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    ytDlpProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ytDlpProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(errorOutput));
      } else {
        try {
          const info = JSON.parse(output);
          resolve(info);
        } catch (err) {
          reject(err);
        }
      }
    });
  });
}

// Rota para listar formatos disponíveis (somente vídeo)
app.post('/formats', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).send({ error: 'A URL do vídeo é necessária.' });

  try {
    const info = await runYtDlpJson(url);

    const formats = info.formats.map(f => ({
      format_id: f.format_id,
      ext: f.ext,
      format_note: f.format_note,
      acodec: f.acodec,
      vcodec: f.vcodec,
      filesize: f.filesize,
      resolution: f.resolution || `${f.width || '?'}x${f.height || '?'}`,
      height: f.height || 0,
      fps: f.fps || null,
      tbr: f.tbr || null,
    }));

    const videoFormats = formats.filter(f => f.vcodec !== 'none');
    const bestAudioFormat = chooseBestAudioFormat(formats);

    res.send({ videoFormats, bestAudioFormat });
  } catch (error) {
    res.status(500).send({ error: 'Erro ao obter formatos: ' + error.message });
  }
});

// Rota para baixar vídeo mesclado com o melhor áudio
app.post('/download', async (req, res) => {
  const { url, format_id } = req.body;
  if (!url) return res.status(400).send({ error: 'A URL do vídeo é necessária.' });
  if (!format_id) return res.status(400).send({ error: 'O format_id do vídeo é necessário para o download.' });

  try {
    const info = await runYtDlpJson(url);

    const formats = info.formats.map(f => ({
      format_id: f.format_id,
      acodec: f.acodec,
      vcodec: f.vcodec,
      tbr: f.tbr || 0,
    }));

    const bestAudio = formats
      .filter(f => f.acodec !== 'none' && f.vcodec === 'none')
      .sort((a, b) => b.tbr - a.tbr)[0];

    if (!bestAudio) {
      return res.status(500).send({ error: 'Não foi possível encontrar um formato de áudio para mesclar.' });
    }

    const formatCombo = `${format_id}+${bestAudio.format_id}`;
    const outputTemplate = path.join(videoDir, '%(title)s.%(ext)s');

    await new Promise((resolve, reject) => {
      const args = ['-f', formatCombo, '-o', outputTemplate, '--extractor-args', 'youtube:player_client=default', url];
      const downloadProcess = spawn('yt-dlp', args);

      downloadProcess.stdout.on('data', (data) => {
        console.log(`yt-dlp: ${data}`);
      });

      downloadProcess.stderr.on('data', (data) => {
        console.error(`yt-dlp error: ${data}`);
      });

      downloadProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
    });

    res.send({ message: 'Download concluído com sucesso!' });
  } catch (error) {
    res.status(500).send({ error: 'Erro ao baixar vídeo: ' + error.message });
  }
});

// Rota teste
app.get('/', (req, res) => {
  res.send('Backend está funcionando!');
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});