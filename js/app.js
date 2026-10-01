/*
 * RECICLA.IA — LÓGICA DA APLICAÇÃO
 * O aluno normalmente NÃO precisa modificar este arquivo.
 * Personalize textos e diretório do modelo em js/config.js.
 * Personalize cores em css/style.css.
 * O projeto aceita qualquer modelo de IMAGEM do Teachable Machine com 4 classes.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const config = window.RECICLA_CONFIG;
  const state = $('modelState');
  const status = $('status');
  const inputs = $('inputs');
  const canvas = $('preview');
  const ctx = canvas.getContext('2d');

  let model = null;
  let classNames = [];
  let busy = false;
  let cameraStream = null;
  let cameraStarting = false;
  let cameraRequest = 0;

  $('appName').textContent = config.appName;
  $('subtitle').textContent = config.subtitle;
  document.title = `${config.appName} — Machine Learning na Prática`;

  function feedback(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('bad', isError);
  }

  function prettyClass(name) {
    return config.labels[name] || name;
  }

  function percent(n) {
    return (Math.max(0, Math.min(1, n)) * 100).toFixed(1).replace('.', ',') + '%';
  }

  // ETAPA 1 — Carrega o modelo treinado. A pasta fica configurável em config.js.
  async function initialize() {
    try {
      if (!window.tf || !window.tmImage) {
        throw new Error('Bibliotecas de IA indisponíveis. Verifique a internet e recarregue.');
      }
      const folder = String(config.modelDirectory || './modelo/').replace(/\/?$/, '/');
      model = await window.tmImage.load(folder + 'model.json', folder + 'metadata.json');
      classNames = model.getClassLabels();
      if (!Array.isArray(classNames) || classNames.length !== 4 || new Set(classNames).size !== 4) {
        throw new Error('O modelo precisa conter exatamente quatro classes diferentes. Confira metadata.json.');
      }
      state.textContent = '✓ Modelo treinado carregado';
      feedback('Tudo pronto! Fotografe ou escolha uma imagem.');
      inputs.disabled = false;
    } catch (e) {
      state.textContent = '⚠ IA indisponível';
      feedback(e.message || 'Não foi possível carregar o modelo.', true);
    }
  }

  // ETAPA 2 — Prepara a foto no canvas para a IA analisar.
  function drawImage(image) {
    const size = config.maxCanvasSize;
    canvas.width = size;
    canvas.height = size;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  }

  // ETAPA 3 — Mostra o resultado e as probabilidades das quatro classes.
  function render(predictions) {
    const byName = new Map(predictions.map((p) => [p.className, Number(p.probability)]));
    const sorted = classNames.map((name) => {
      const probability = byName.get(name);
      if (!Number.isFinite(probability)) throw new Error('Previsão inválida para ' + name);
      return { name, probability: Math.max(0, Math.min(1, probability)) };
    }).sort((a, b) => b.probability - a.probability);

    const first = sorted[0];
    const second = sorted[1];
    const uncertain = first.probability < config.confidenceThreshold ||
      (first.probability - second.probability) < config.differenceThreshold;

    $('topLabel').textContent = (uncertain ? 'Possível: ' : '') + prettyClass(first.name);
    $('topScore').textContent = 'Confiança: ' + percent(first.probability);
    $('bars').replaceChildren();

    for (const item of sorted) {
      const row = document.createElement('div');
      const heading = document.createElement('div');
      const label = document.createElement('span');
      const value = document.createElement('span');
      const track = document.createElement('div');
      const fill = document.createElement('div');
      row.className = 'barrow';
      heading.className = 'barhead';
      track.className = 'barbg';
      fill.className = 'barfill';
      label.textContent = prettyClass(item.name);
      value.textContent = percent(item.probability);
      fill.style.width = percent(item.probability).replace(',', '.');
      heading.append(label, value);
      track.append(fill);
      row.append(heading, track);
      $('bars').append(row);
    }

    $('caution').textContent = uncertain
      ? 'Resultado incerto: teste outra fotografia e observe as demais classes. A IA pode confundir os materiais.'
      : 'Mesmo com confiança alta, a IA pode errar. Este resultado não comprova o material nem determina o descarte.';
    $('output').hidden = false;
  }

  async function classify(file) {
    if (!model || busy || !file) return;
    if (!file.type.startsWith('image/')) {
      feedback('Selecione uma imagem JPG ou PNG.', true);
      return;
    }
    if (file.size > config.maxImageSizeMB * 1024 * 1024) {
      feedback(`A imagem é muito grande. O limite configurado é ${config.maxImageSizeMB} MB.`, true);
      return;
    }

    busy = true;
    inputs.disabled = true;
    $('imageArea').hidden = false;
    $('output').hidden = true;
    feedback('Preparando fotografia…');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Não foi possível abrir a imagem. Use JPG ou PNG.'));
        image.src = url;
      });
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('A imagem está vazia.');
      drawImage(image);
      feedback('A IA está analisando a fotografia…');
      const predictions = await model.predict(canvas);
      if (!Array.isArray(predictions) || predictions.length !== classNames.length) {
        throw new Error('O modelo retornou um resultado incompleto.');
      }
      render(predictions);
      feedback('Classificação concluída! Você pode testar outra imagem.');
    } catch (e) {
      feedback('Falha na análise: ' + (e.message || 'erro desconhecido'), true);
    } finally {
      URL.revokeObjectURL(url);
      busy = false;
      inputs.disabled = false;
    }
  }

  // ETAPA 4 — Câmera real (notebook ou celular com HTTPS ou localhost).
  function stopCamera() {
    cameraRequest++;
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    const video = $('liveVideo');
    video.pause();
    video.srcObject = null;
    $('cameraArea').hidden = true;
    $('capturePhoto').disabled = true;
    cameraStarting = false;
    $('openCamera').disabled = false;
  }

  async function startCamera() {
    if (!model || busy || cameraStarting || cameraStream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      feedback('Câmera indisponível aqui. Abra por HTTPS ou localhost, ou use Escolher imagem.', true);
      return;
    }
    cameraStarting = true;
    $('openCamera').disabled = true;
    const request = ++cameraRequest;
    feedback('Solicitando acesso à câmera…');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (request !== cameraRequest) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStream = stream;
      $('cameraArea').hidden = false;
      const video = $('liveVideo');
      video.srcObject = stream;
      await video.play();
      if (request !== cameraRequest) return;
      $('capturePhoto').disabled = false;
      feedback('Câmera pronta. Clique em Capturar e analisar.');
    } catch (e) {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (request !== cameraRequest) return;
      stopCamera();
      const denied = e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError';
      feedback(denied
        ? 'Permissão negada. Autorize a câmera no navegador ou selecione uma imagem.'
        : 'Não foi possível abrir a câmera. Verifique se outro programa a está usando.', true);
    } finally {
      if (request === cameraRequest) {
        cameraStarting = false;
        $('openCamera').disabled = false;
      }
    }
  }

  async function capturePhoto() {
    const video = $('liveVideo');
    if (!cameraStream || video.readyState < 2 || busy) return;
    $('capturePhoto').disabled = true;
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const temporary = document.createElement('canvas');
    temporary.width = Math.max(1, Math.round(video.videoWidth * scale));
    temporary.height = Math.max(1, Math.round(video.videoHeight * scale));
    temporary.getContext('2d').drawImage(video, 0, 0, temporary.width, temporary.height);
    stopCamera();
    const blob = await new Promise((resolve) => temporary.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) {
      feedback('Falha ao capturar a foto. Tente novamente.', true);
      return;
    }
    await classify(new File([blob], 'foto-camera.jpg', { type: 'image/jpeg' }));
  }

  $('openCamera').addEventListener('click', startCamera);
  $('capturePhoto').addEventListener('click', capturePhoto);
  $('cancelCamera').addEventListener('click', () => {
    stopCamera();
    feedback('Câmera fechada. Você pode tentar novamente ou escolher uma imagem.');
  });
  $('gallery').addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (cameraStream) stopCamera();
    classify(file);
  });
  window.addEventListener('pagehide', stopCamera);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && cameraStream) stopCamera();
  });

  initialize();
})();
