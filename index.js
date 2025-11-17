const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const ytdlp = require('yt-dlp-exec');

const app = express();
app.use(express.json());
app.use(cors());

const videoDir = path.resolve(os.tmpdir(), 'downloads');

// Função para escolher o melhor formato de áudio (mantém igual)
function chooseBestAudioFormat(formats) {
  const audioOnly = formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');
  if (audioOnly.length === 0) return null;
  return audioOnly.sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0];
}

// Rota para listar formatos disponíveis (somente vídeo)
app.post('/formats', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).send({ error: 'A URL do vídeo é necessária.' });

  try {
    const info = await ytdlp(url, {
      dumpSingleJson: true,
      extractorArgs: { youtube: { player_client: 'default' } },
    });

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
    const info = await ytdlp(url, {
      dumpSingleJson: true,
      extractorArgs: { youtube: { player_client: 'default' } },
    });

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

    await ytdlp(url, {
      format: formatCombo,
      output: outputTemplate,
      extractorArgs: { youtube: { player_client: 'default' } },
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