const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const app = express();
app.use(express.json());
app.use(cors());

// Usa a pasta temporária do sistema para salvar arquivos (Render e outros ambientes)
const videoDir = path.resolve(os.tmpdir(), 'downloads');
const ytDlpCommand = 'yt-dlp';

// Função para escolher o melhor formato de áudio
function chooseBestAudioFormat(formats) {
  const audioOnly = formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');
  if (audioOnly.length === 0) return null;

  return audioOnly.sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0];
}

// Rota para listar formatos disponíveis (somente vídeo)
app.post('/formats', (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).send({ error: 'A URL do vídeo é necessária.' });
  }

  const args = [
    '--dump-json',
    '--extractor-args', 'youtube:player_client=default',
    url
  ];

  const ytDlpProcess = spawn(ytDlpCommand, args);

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
      return res.status(500).send({ error: `Erro ao obter formatos: ${errorOutput}` });
    }

    try {
      const info = JSON.parse(output);
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
        tbr: f.tbr || null
      }));

      const videoFormats = formats.filter(f => f.vcodec !== 'none');
      const bestAudioFormat = chooseBestAudioFormat(formats);

      res.send({ videoFormats, bestAudioFormat });
    } catch (err) {
      res.status(500).send({ error: 'Erro ao processar os formatos do vídeo.' });
    }
  });
});

// Rota para baixar vídeo mesclado com o melhor áudio
app.post('/download', (req, res) => {
  const { url, format_id } = req.body;

  if (!url) {
    return res.status(400).send({ error: 'A URL do vídeo é necessária.' });
  }
  if (!format_id) {
    return res.status(400).send({ error: 'O format_id do vídeo é necessário para o download.' });
  }

  const argsGetFormats = [
    '--dump-json',
    '--extractor-args', 'youtube:player_client=default',
    url
  ];

  const ytDlpProcess = spawn(ytDlpCommand, argsGetFormats);

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
      return res.status(500).send({ error: `Erro ao obter formatos para download: ${errorOutput}` });
    }

    try {
      const info = JSON.parse(output);
      const formats = info.formats.map(f => ({
        format_id: f.format_id,
        acodec: f.acodec,
        vcodec: f.vcodec,
        tbr: f.tbr || 0
      }));

      const bestAudio = formats
        .filter(f => f.acodec !== 'none' && f.vcodec === 'none')
        .sort((a, b) => b.tbr - a.tbr)[0];

      if (!bestAudio) {
        return res.status(500).send({ error: 'Não foi possível encontrar um formato de áudio para mesclar.' });
      }

      const formatCombo = `${format_id}+${bestAudio.format_id}`;
      const outputTemplate = `${videoDir}/%(title)s.%(ext)s`;

      const argsDownload = [
        '-f', formatCombo,
        '--extractor-args', 'youtube:player_client=default',
        '-o', outputTemplate,
        url
      ];

      const downloadProcess = spawn(ytDlpCommand, argsDownload);

      downloadProcess.stdout.on('data', (data) => {
        console.log(`Status: ${data}`);
      });

      downloadProcess.stderr.on('data', (data) => {
        console.error(`Erro: ${data}`);
      });

      downloadProcess.on('close', (code) => {
        if (code === 0) {
          res.send({ message: 'Download concluído com sucesso!' });
        } else {
          res.status(500).send({ error: `Erro ao baixar vídeo. Código de saída: ${code}` });
        }
      });
    } catch (err) {
      res.status(500).send({ error: 'Erro ao processar os formatos para download.' });
    }
  });
});

// Rota teste para verificar se o backend está rodando
app.get('/', (req, res) => {
  res.send('Backend está funcionando!');
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});