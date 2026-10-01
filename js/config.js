/*
 * RECICLA.IA — CONFIGURAÇÃO DO GRUPO
 * 1. Para substituir a IA: copie model.json, metadata.json e weights.bin
 *    para a pasta indicada em modelDirectory.
 * 2. Para renomear a aplicação: altere appName e também manifest.webmanifest.
 * 3. Para alterar as cores: edite css/style.css, no bloco :root.
 * 4. Para trocar o ícone: substitua os PNGs da pasta icons/.
 */
window.RECICLA_CONFIG = {
  appName: 'ReciclaP13.IA',
  subtitle: 'Machine Learning na prática • Protótipo educacional',
  modelDirectory: './modelo/',
  labels: {
    PLASTICO: 'PLÁSTICO',
    METAL: 'METAL',
    PAPEL: 'PAPEL',
    VIDRO: 'VIDRO'
  },
  confidenceThreshold: 0.55,
  differenceThreshold: 0.12,
  maxImageSizeMB: 20,
  maxCanvasSize: 512
};
