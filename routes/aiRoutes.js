const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.post('/ai/suggest-menu', async (req, res) => {
  if (!process.env.HUGGINGFACE_API_KEY) {
    return res.status(503).json({
      error: 'AI tidak dikonfigurasi'
    });
  }

  const { kategori, catatan } = req.body;

  try {
    const prompt = `
Anda ahli gizi MBG.

Buatkan menu untuk kategori ${kategori}.

${catatan || ''}

Jawab JSON valid:

{
  "nama_menu": "",
  "deskripsi": "",
  "bahan": [
    {
      "nama": "",
      "jumlah": 0,
      "satuan": ""
    }
  ],
  "kandungan_gizi": {
    "kalori": 0,
    "protein": 0,
    "karbohidrat": 0,
    "lemak": 0,
    "serat": 0
  },
  "gramasi_total": 0
}
`;

    const response = await fetch(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 800,
            temperature: 0.7
          }
        })
      }
    );

    const result = await response.json();

    let text = result?.[0]?.generated_text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({
        error: 'AI tidak menghasilkan JSON valid'
      });
    }

    res.json({
      suggestion: JSON.parse(jsonMatch[0])
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});

module.exports = router;