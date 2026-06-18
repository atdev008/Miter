import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Camera,
  Check,
  CircleDashed,
  Clock,
  Download,
  FileSpreadsheet,
  Gauge,
  Image,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Send,
  ScanLine,
  Search,
  Server,
  SlidersHorizontal,
  Upload,
  User,
  X
} from 'lucide-react';
import './styles.css';

const CAMERA_CROP_FILE_NAME = 'meter-camera-crop.jpg';

const steps = [
  {
    id: 'upload',
    title: 'Upload',
    detail: 'Images and meter data',
    icon: Upload
  },
  {
    id: 'detect',
    title: 'Detect',
    detail: 'Find LCD area',
    icon: ScanLine
  },
  {
    id: 'enhance',
    title: 'Enhance',
    detail: 'Clean crop image',
    icon: SlidersHorizontal
  },
  {
    id: 'ocr',
    title: 'OCR',
    detail: 'Read meter digits',
    icon: Search
  },
  {
    id: 'validate',
    title: 'Validate',
    detail: 'Rules and confidence',
    icon: Check
  },
  {
    id: 'compare',
    title: 'Compare',
    detail: 'OCR vs user input',
    icon: Gauge
  },
  {
    id: 'report',
    title: 'Report',
    detail: 'Save and export',
    icon: FileSpreadsheet
  }
];

const rows = [
  {
    image: 'FM-20260604-001.jpg',
    vessel: 'MT Andaman',
    date: '2026-06-04 08:12',
    input: '184920',
    ocr: '184920',
    diff: '0',
    confidence: '96.8%',
    status: 'PASS'
  },
  {
    image: 'FM-20260604-002.jpg',
    vessel: 'MT Chao Phraya',
    date: '2026-06-04 08:27',
    input: '099240',
    ocr: '099248',
    diff: '+8',
    confidence: '93.1%',
    status: 'FAIL'
  },
  {
    image: 'FM-20260604-003.jpg',
    vessel: 'MT Mekong',
    date: '2026-06-04 08:43',
    input: '271080',
    ocr: '271O80',
    diff: '-',
    confidence: '81.4%',
    status: 'LOW_CONFIDENCE'
  },
  {
    image: 'FM-20260604-004.jpg',
    vessel: 'MT Sriracha',
    date: '2026-06-04 09:02',
    input: '441105',
    ocr: '-',
    diff: '-',
    confidence: '0%',
    status: 'NO_METER_FOUND'
  }
];

const statusMeta = {
  PASS: { label: 'PASS', icon: Check },
  FAIL: { label: 'FAIL', icon: X },
  LOW_CONFIDENCE: { label: 'LOW CONF.', icon: AlertTriangle },
  NO_METER_FOUND: { label: 'NO METER', icon: CircleDashed },
  PROCESSING: { label: 'PROCESSING', icon: CircleDashed },
  ERROR: { label: 'ERROR', icon: AlertTriangle }
};

const TYPHOON_BASE_URL = import.meta.env.VITE_TYPHOON_BASE_URL || 'https://api.opentyphoon.ai/v1';
const TYPHOON_API_KEY = import.meta.env.VITE_TYPHOON_API_KEY || '';
const TYPHOON_OCR_MODEL = import.meta.env.VITE_TYPHOON_OCR_MODEL || 'typhoon-ocr';
const TYPHOON_CHAT_MODEL = import.meta.env.VITE_TYPHOON_CHAT_MODEL || 'typhoon-v2.1-12b-instruct';
const AUTH_STORAGE_KEY = 'miter.auth.session';

const stepOneDefaults = {
  vessel: 'MT Chao Phraya',
  captureDate: '2026-06-04 08:27'
};

const thaiDigits = {
  '๐': '0',
  '๑': '1',
  '๒': '2',
  '๓': '3',
  '๔': '4',
  '๕': '5',
  '๖': '6',
  '๗': '7',
  '๘': '8',
  '๙': '9'
};

function normalizeDigits(value = '') {
  return String(value)
    .replace(/[๐-๙]/g, (digit) => thaiDigits[digit] || digit)
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[^\d]/g, '');
}

function normalizeReadingValue(value = '') {
  const cleaned = String(value)
    .replace(/[๐-๙]/g, (digit) => thaiDigits[digit] || digit)
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '');
  const [integerPart, ...decimalParts] = cleaned.split('.');

  if (decimalParts.length === 0) {
    return integerPart;
  }

  const decimalPart = decimalParts.join('');
  return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
}

function readingsMatch(left = '', right = '') {
  const leftValue = normalizeReadingValue(left);
  const rightValue = normalizeReadingValue(right);

  if (!leftValue || !rightValue) {
    return false;
  }

  if (leftValue.includes('.') || rightValue.includes('.')) {
    return Number(leftValue) === Number(rightValue);
  }

  return leftValue === rightValue;
}

function formatReadingDifference(left = '', right = '') {
  const leftValue = normalizeReadingValue(left);
  const rightValue = normalizeReadingValue(right);

  if (!leftValue || !rightValue) {
    return '-';
  }

  const diffValue = Number(leftValue) - Number(rightValue);
  if (!Number.isFinite(diffValue)) {
    return '-';
  }

  return diffValue > 0 ? `+${diffValue}` : String(diffValue);
}

function scoreReadingCandidate(value = '') {
  const readingValue = normalizeReadingValue(value);
  const digitCount = normalizeDigits(readingValue).length;
  const hasDecimal = readingValue.includes('.');
  const hasDecimalShape = /^\d+\.\d+$/.test(readingValue);

  return (digitCount * 10) + (hasDecimalShape ? 6 : hasDecimal ? 3 : 0);
}

function extractMeterDigits(value = '') {
  const normalizedText = String(value).replace(/[๐-๙]/g, (digit) => thaiDigits[digit] || digit);
  const candidates = normalizedText.match(/[0-9OoIl|][0-9OoIl|,\s.\-]{1,}[0-9OoIl|]/g) || [];
  const digitCandidates = candidates
    .map(normalizeReadingValue)
    .filter(Boolean)
    .sort((a, b) => scoreReadingCandidate(b) - scoreReadingCandidate(a));

  return digitCandidates[0] || normalizeReadingValue(normalizedText);
}

function readAuthSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(AUTH_STORAGE_KEY);
    const session = stored ? JSON.parse(stored) : null;
    return session?.username ? session : null;
  } catch {
    return null;
  }
}

function saveAuthSession(username) {
  const session = { username };
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

function clearAuthSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function cropVideoFrameToFile(video, guide, fileName = CAMERA_CROP_FILE_NAME) {
  return new Promise((resolve, reject) => {
    if (!video.videoWidth || !video.videoHeight) {
      reject(new Error('Camera is not ready yet'));
      return;
    }

    const videoRect = video.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();
    const scale = Math.max(videoRect.width / video.videoWidth, videoRect.height / video.videoHeight);
    const renderedWidth = video.videoWidth * scale;
    const renderedHeight = video.videoHeight * scale;
    const offsetX = (renderedWidth - videoRect.width) / 2;
    const offsetY = (renderedHeight - videoRect.height) / 2;

    const sourceX = Math.max(0, (guideRect.left - videoRect.left + offsetX) / scale);
    const sourceY = Math.max(0, (guideRect.top - videoRect.top + offsetY) / scale);
    const sourceWidth = Math.min(video.videoWidth - sourceX, guideRect.width / scale);
    const sourceHeight = Math.min(video.videoHeight - sourceY, guideRect.height / scale);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth));
    canvas.height = Math.max(1, Math.round(sourceHeight));
    const context = canvas.getContext('2d');
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Cannot capture camera image'));
        return;
      }

      resolve(new File([blob], fileName, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Cannot read uploaded image'));
    reader.readAsDataURL(file);
  });
}

async function readMeterDigitsWithTyphoon(file) {
  if (!TYPHOON_API_KEY) {
    throw new Error('Missing VITE_TYPHOON_API_KEY');
  }

  const imageUrl = await fileToDataUrl(file);
  const response = await fetch(`${TYPHOON_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TYPHOON_API_KEY}`
    },
    body: JSON.stringify({
      model: TYPHOON_OCR_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                'Extract only the primary meter reading value from the rectangular LCD or odometer digit window.',
                'Read the main large digits from left to right. Ignore labels, button text, warnings, units, logos, screws, borders, pointers, and small secondary numbers.',
                'For LCD readings, preserve the decimal point exactly where it appears between digits. Do not collapse a value like 523.867 into 523867.',
                'For mechanical odometer readings, include a decimal point only when it is visibly part of the meter value.',
                'If a dot-like mark is only a border, scratch, screw, or separator outside the digit value, ignore it.',
                'Return compact JSON only: {"digits":"...", "confidence": 0-100}. If no meter reading is visible, use {"digits":"", "confidence":0}.'
              ].join(' ')
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      max_tokens: 512,
      temperature: 0.1,
      top_p: 0.6,
      repetition_penalty: 1.2,
      stream: false
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `Typhoon OCR failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content || '';
  let parsed = {};

  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { digits: extractMeterDigits(content), confidence: 0, rawText: content };
  }

  const digits = extractMeterDigits(parsed.digits || parsed.natural_text || content);
  return {
    digits,
    confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : 0,
    rawText: content,
    imageUrl
  };
}

async function askTyphoonAssistant(question, context) {
  if (!TYPHOON_API_KEY) {
    throw new Error('Missing VITE_TYPHOON_API_KEY');
  }

  const response = await fetch(`${TYPHOON_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TYPHOON_API_KEY}`
    },
    body: JSON.stringify({
      model: TYPHOON_CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an assistant for a fuel meter OCR review app. Answer in Thai, be concise, and use the supplied OCR context when relevant.'
        },
        {
          role: 'user',
          content: `Current OCR context:\n${JSON.stringify(context, null, 2)}\n\nQuestion: ${question}`
        }
      ],
      max_tokens: 512,
      temperature: 0.3,
      top_p: 0.9,
      repetition_penalty: 1.05,
      stream: false
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `Typhoon assistant failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content?.trim() || 'ไม่พบคำตอบ';
}

function App() {
  const [authSession, setAuthSession] = useState(() => readAuthSession());
  const [active, setActive] = useState(0);
  const [selectedFile, setSelectedFile] = useState('FM-20260604-002.jpg');
  const [userInput, setUserInput] = useState('');
  const [uploadedImage, setUploadedImage] = useState('');
  const [showStepOnePayload, setShowStepOnePayload] = useState(false);
  const [ocrState, setOcrState] = useState({
    status: 'idle',
    digits: '',
    confidence: 0,
    error: '',
    rawText: ''
  });
  const activeStep = steps[active];

  const result = useMemo(() => {
    const hasOcrResult = ocrState.status === 'done';
    const isReading = ocrState.status === 'reading';
    const isError = ocrState.status === 'error';
    const ocr = active >= 3 && hasOcrResult ? ocrState.digits || '-' : '-';
    const confidence = active >= 3 && hasOcrResult ? ocrState.confidence : 0;
    const userValue = normalizeReadingValue(userInput);
    const ocrValue = normalizeReadingValue(ocr);
    let status = 'PROCESSING';
    let difference = '-';

    if (isError && active >= 3) {
      status = 'ERROR';
    } else if (active >= 3 && hasOcrResult) {
      if (!ocrValue) {
        status = 'NO_METER_FOUND';
      } else if (confidence > 0 && confidence < 85) {
        status = 'LOW_CONFIDENCE';
      } else {
        status = readingsMatch(ocr, userInput) ? 'PASS' : 'FAIL';
      }
    } else if (isReading) {
      status = 'PROCESSING';
    }

    if (active >= 5 && ocrValue && userValue) {
      difference = formatReadingDifference(ocr, userInput);
    }

    return { confidence, ocr, status, difference, error: ocrState.error };
  }, [active, ocrState, userInput]);

  const stepOnePayload = useMemo(() => ({
    workflow: 'fuel-meter-image-verification',
    fromStep: steps[0].id,
    nextStep: steps[1].id,
    image: {
      fileName: selectedFile,
      source: uploadedImage ? 'uploaded-file' : 'sample-file'
    },
    meterData: {
      vessel: stepOneDefaults.vessel,
      captureDate: stepOneDefaults.captureDate,
      userInput,
      normalizedUserInput: normalizeReadingValue(userInput)
    },
    ocrRequest: {
      provider: 'Typhoon OCR',
      model: TYPHOON_OCR_MODEL,
      status: ocrState.status,
      digits: ocrState.digits,
      confidence: ocrState.confidence
    }
  }), [ocrState.confidence, ocrState.digits, ocrState.status, selectedFile, uploadedImage, userInput]);

  const handleImageUpload = async (file) => {
    setSelectedFile(file.name);
    setShowStepOnePayload(false);
    setOcrState({
      status: 'reading',
      digits: '',
      confidence: 0,
      error: '',
      rawText: ''
    });

    try {
      const ocr = await readMeterDigitsWithTyphoon(file);
      setUploadedImage(ocr.imageUrl);
      setOcrState({
        status: 'done',
        digits: ocr.digits,
        confidence: ocr.confidence,
        error: '',
        rawText: ocr.rawText
      });
      setUserInput(ocr.digits);
    } catch (error) {
      setUploadedImage(URL.createObjectURL(file));
      setOcrState({
        status: 'error',
        digits: '',
        confidence: 0,
        error: error.message || 'Typhoon OCR failed',
        rawText: ''
      });
    }
  };

  const goBack = () => {
    setShowStepOnePayload(false);
    setActive((value) => Math.max(0, value - 1));
  };
  const goNext = () => {
    if (active === 0 && !showStepOnePayload) {
      setShowStepOnePayload(true);
      return;
    }

    setShowStepOnePayload(false);
    setActive((value) => Math.min(steps.length - 1, value + 1));
  };

  const isAuthenticated = Boolean(authSession);
  const currentUser = authSession?.username || '';

  if (!isAuthenticated) {
    return <LoginPage onLogin={(username) => {
      setAuthSession(saveAuthSession(username));
    }} />;
  }

  return (
    <main className="appShell">
      <aside className="sideRail" aria-label="System navigation">
        <div className="brandMark">
          <Gauge size={25} aria-hidden="true" />
        </div>
        <button className="railButton active" aria-label="Verification" title="Verification">
          <Camera size={20} />
        </button>
        <button className="railButton" aria-label="Analytics" title="Analytics">
          <BarChart3 size={20} />
        </button>
        <button className="railButton" aria-label="OCR service" title="OCR service">
          <Server size={20} />
        </button>
        <div className="railUser railBottom">
          <span className="railUserName">
            <User size={16} />
            <span>{currentUser}</span>
          </span>
          <button
            className="railButton"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => {
              clearAuthSession();
              setAuthSession(null);
            }}
          >
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topBar">
          <div>
            <p className="eyebrow">Fuel Meter Image Verification</p>
            <h1>Batch OCR Review</h1>
          </div>
          <div className="topActions" aria-label="Batch controls">
            <button className="statusButton" type="button">
              <span className="liveDot" aria-hidden="true" />
              OCR Service Online
            </button>
            <button className="primaryButton" type="button">
              <Upload size={18} />
              <span>New Batch</span>
            </button>
          </div>
        </header>

        <div className="kpiStrip" aria-label="KPI summary">
          <Metric icon={Check} label="Accuracy" value="95%+" tone="good" />
          <Metric icon={AlertTriangle} label="Manual Review" value="<10%" tone="warn" />
          <Metric icon={Clock} label="Speed" value="<10s" tone="info" />
          <Metric icon={Image} label="Daily Load" value="200" tone="neutral" />
        </div>

        <Workflow active={active} setActive={setActive} />

        <section className="mainGrid">
          <div className="workPanel">
            <div className="panelHeader">
              <div>
                <p className="panelKicker">Step {active + 1} of {steps.length}</p>
                <h2>{activeStep.title}</h2>
              </div>
              <div className="stepIcon" aria-hidden="true">
                <activeStep.icon size={22} />
              </div>
            </div>
            <StepBody
              active={active}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              onImageUpload={handleImageUpload}
              userInput={userInput}
              setUserInput={setUserInput}
              result={result}
              ocrState={ocrState}
              payloadPreview={stepOnePayload}
              showPayloadPreview={showStepOnePayload}
            />
            <div className="stepControls">
              <button className="iconButton" onClick={goBack} disabled={active === 0} aria-label="Back">
                <ArrowLeft size={18} />
              </button>
              <div className="progressText">{activeStep.detail}</div>
              <button className="primaryButton" onClick={goNext} disabled={active === steps.length - 1}>
                <span>{active === steps.length - 2 ? 'Go to Report' : 'Next'}</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>

          <aside className="reviewPanel">
            <div className="meterPreview">
              <div className={uploadedImage ? 'phoneFrame uploaded' : 'phoneFrame'}>
                {uploadedImage && <img src={uploadedImage} alt="Uploaded meter" />}
                <div className="meterBody">
                  <div className={active >= 1 ? 'lcdBox detected' : 'lcdBox'}>
                    <span>{active >= 3 ? result.ocr : ocrState.digits || '099248'}</span>
                  </div>
                  <div className="meterMarks">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            </div>
            <ResultSummary result={result} userInput={userInput} />
          </aside>
        </section>

        <ReportTable />
      </section>
      <FloatingAssistant
        context={{
          file: selectedFile,
          userInput,
          ocrReading: result.ocr,
          confidence: result.confidence,
          difference: result.difference,
          status: result.status,
          step: activeStep.title,
          rawOcr: ocrState.rawText
        }}
      />
    </main>
  );
}

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (username === 'admin' && password === '123456') {
      setError('');
      onLogin(username);
      return;
    }
    setError('Invalid username or password');
  };

  return (
    <main className="loginShell">
      <section className="loginPanel" aria-label="Login">
        <div className="loginBrand">
          <span className="loginMark">
            <Gauge size={28} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Fuel Meter Image Verification</p>
            <h1>Operator Login</h1>
          </div>
        </div>

        <form className="loginForm" onSubmit={handleSubmit}>
          <label>
            Username
            <input
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <div className="loginError" role="alert">
              <AlertTriangle size={17} />
              <span>{error}</span>
            </div>
          )}
          <button className="primaryButton loginButton" type="submit">
            <LockKeyhole size={18} />
            <span>Sign In</span>
          </button>
        </form>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value, tone }) {
  return (
    <button className={`metric ${tone || ''}`} type="button">
      <span className="metricIcon">
        <Icon size={15} />
      </span>
      <span className="metricLabel">{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function Workflow({ active, setActive }) {
  return (
    <nav className="workflow" aria-label="OCR workflow">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const state = index < active ? 'done' : index === active ? 'current' : 'pending';
        return (
          <button className={`node ${state}`} key={step.id} onClick={() => setActive(index)}>
            <span className="nodeNumber">{index + 1}</span>
            <span className="nodeIcon"><Icon size={20} /></span>
            <span className="nodeCopy">
              <strong>{step.title}</strong>
              <small>{step.detail}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function StepBody({
  active,
  selectedFile,
  setSelectedFile,
  onImageUpload,
  userInput,
  setUserInput,
  result,
  ocrState,
  payloadPreview,
  showPayloadPreview
}) {
  const galleryInputRef = useRef(null);
  const videoRef = useRef(null);
  const guideRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    if (!cameraOpen) {
      return undefined;
    }

    let activeStream = null;

    async function startCamera() {
      setCameraError('');

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera is not supported by this browser');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        activeStream = stream;
        setCameraStream(stream);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        setCameraError(error.message || 'Cannot open camera');
      }
    }

    startCamera();

    return () => {
      stopMediaStream(activeStream);
      setCameraStream(null);
    };
  }, [cameraOpen]);

  const handleGalleryFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (file) {
      setSelectedFile(file.name);
      onImageUpload(file);
    }
  };

  const handleCameraCapture = async () => {
    if (!videoRef.current || !guideRef.current) {
      return;
    }

    try {
      setCameraError('');
      const file = await cropVideoFrameToFile(videoRef.current, guideRef.current);
      setCameraOpen(false);
      setSelectedFile(file.name);
      onImageUpload(file);
    } catch (error) {
      setCameraError(error.message || 'Cannot capture meter reading');
    }
  };

  const closeCamera = () => {
    setCameraOpen(false);
    setCameraError('');
  };

  if (active === 0) {
    return (
      <div className="stepBody stepOneStack">
        <div className="uploadGrid">
          <div className="dropZone">
            <Image size={30} />
            <span>{selectedFile}</span>
            {ocrState.status === 'reading' && <small>Reading digits with Typhoon OCR...</small>}
            <div className="uploadActions">
              <button className="primaryButton" type="button" onClick={() => setCameraOpen(true)}>
                <Camera size={18} />
                <span>Camera</span>
              </button>
              <button className="secondaryButton" type="button" onClick={() => galleryInputRef.current?.click()}>
                <Upload size={18} />
                <span>Choose Image</span>
              </button>
            </div>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handleGalleryFile}
            />
          </div>
          <div className="formStack">
            <label>
              Vessel
              <input value={stepOneDefaults.vessel} readOnly />
            </label>
            <label>
              Capture Date
              <input value={stepOneDefaults.captureDate} readOnly />
            </label>
            <label>
              User Input
              <input value={userInput} onChange={(event) => setUserInput(event.target.value)} inputMode="decimal" />
            </label>
          </div>
        </div>
        {showPayloadPreview && (
          <section className="jsonPreview" aria-label="JSON payload preview">
            <div className="jsonPreviewHeader">
              <div>
                <p className="panelKicker">Next payload</p>
                <h3>JSON ที่จะส่งไป Step 2</h3>
              </div>
              <span>Preview</span>
            </div>
            <pre>{JSON.stringify(payloadPreview, null, 2)}</pre>
          </section>
        )}
        {cameraOpen && (
          <div className="cameraOverlay" role="dialog" aria-modal="true" aria-label="Camera capture">
            <div className="cameraPanel">
              <div className="cameraHeader">
                <div>
                  <p className="panelKicker">Camera</p>
                  <h3>Align Meter Reading</h3>
                </div>
                <button className="iconButton" type="button" aria-label="Close camera" onClick={closeCamera}>
                  <X size={18} />
                </button>
              </div>
              <div className="cameraStage">
                <video ref={videoRef} autoPlay muted playsInline />
                <div className="cameraShade" aria-hidden="true" />
                <div className="meterGuide" ref={guideRef} aria-hidden="true">
                  <span>Meter value only</span>
                </div>
              </div>
              {cameraError && (
                <div className="loginError" role="alert">
                  <AlertTriangle size={17} />
                  <span>{cameraError}</span>
                </div>
              )}
              <div className="cameraActions">
                <button className="secondaryButton" type="button" onClick={closeCamera}>
                  <span>Cancel</span>
                </button>
                <button className="primaryButton" type="button" onClick={handleCameraCapture} disabled={!cameraStream}>
                  <Camera size={18} />
                  <span>Capture</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (active === 1) {
    return (
      <div className="stepBody twoColumn">
        <InfoBlock icon={Server} label="Model" value="YOLO11" helper="LCD detector" />
        <InfoBlock icon={Check} label="Detection" value="Found" helper="LCD area detected" tone="good" />
        <InfoBlock icon={ScanLine} label="Bounding Box" value="248 x 82" helper="x: 84, y: 132" />
        <InfoBlock icon={AlertTriangle} label="Fallback" value="NO_METER" helper="When detector fails" tone="warn" />
      </div>
    );
  }

  if (active === 2) {
    return (
      <div className="stepBody twoColumn">
        <InfoBlock icon={Image} label="Crop" value="LCD only" helper="Remove background" />
        <InfoBlock icon={SlidersHorizontal} label="Contrast" value="Adjusted" helper="Adaptive threshold" tone="good" />
        <InfoBlock icon={SlidersHorizontal} label="Noise" value="Reduced" helper="OpenCV denoise" tone="good" />
        <InfoBlock icon={ScanLine} label="Skew" value="Corrected" helper="Perspective cleanup" />
      </div>
    );
  }

  if (active === 3) {
    return (
      <div className={`stepBody ocrReadout ${ocrState.status}`}>
        <span>OCR Reading</span>
        <strong>{ocrState.status === 'reading' ? 'Reading...' : result.ocr}</strong>
        {ocrState.status === 'error' ? (
          <small>{result.error}</small>
        ) : (
          <small>Typhoon OCR confidence {result.confidence}%</small>
        )}
      </div>
    );
  }

  if (active === 4) {
    const numericValue = /^\d+(?:\.\d+)?$/.test(result.ocr);
    const lengthValid = normalizeDigits(result.ocr).length >= 4;
    const confidenceValid = result.confidence >= 85 || result.confidence === 0;

    return (
      <div className="stepBody validationList">
        <ValidationLine label="Numeric value" pass={numericValue} detail="OCR candidate may include one decimal point" />
        <ValidationLine label="Length validation" pass={lengthValid} detail="At least 4 digits expected" />
        <ValidationLine label="Confidence threshold" pass={confidenceValid} detail={`${result.confidence}% confidence`} />
      </div>
    );
  }

  if (active === 5) {
    return (
      <div className="stepBody compareGrid">
        <InfoBlock icon={Gauge} label="User Input" value={userInput} helper="Value keyed by staff" />
        <InfoBlock icon={Search} label="OCR Reading" value={result.ocr} helper="Value read from image" />
        <InfoBlock icon={AlertTriangle} label="Difference" value={result.difference} helper="Needs review" tone="warn" />
        <InfoBlock icon={X} label="Status" value={result.status} helper="Mismatch found" tone="danger" />
      </div>
    );
  }

  return (
    <div className="stepBody reportActions">
      <button className="primaryButton">
        <Download size={18} />
        <span>Export Exceptions</span>
      </button>
      <button className="secondaryButton">
        <FileSpreadsheet size={18} />
        <span>Save Batch Result</span>
      </button>
    </div>
  );
}

function InfoBlock({ icon: Icon = Gauge, label, value, helper, tone }) {
  return (
    <div className={`infoBlock ${tone || ''}`}>
      <div className="infoHeader">
        <span className="infoIcon">
          <Icon size={18} />
        </span>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {helper && <small>{helper}</small>}
    </div>
  );
}

function ValidationLine({ label, pass, detail }) {
  const Icon = pass ? Check : AlertTriangle;
  return (
    <div className={pass ? 'validation pass' : 'validation warn'}>
      <Icon size={18} />
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function ResultSummary({ result, userInput }) {
  const meta = statusMeta[result.status] || { label: 'PROCESSING', icon: CircleDashed };
  const Icon = meta.icon;
  return (
    <div className="resultSummary">
      <div className="summaryHeader">
        <div>
          <p className="panelKicker">Current Image</p>
          <h2>FM-20260604-002.jpg</h2>
        </div>
        <div className={`statusPill ${result.status.toLowerCase?.() || 'processing'}`}>
          <Icon size={16} />
          <span>{meta.label}</span>
        </div>
      </div>
      <dl>
        <div>
          <dt>User Input</dt>
          <dd>{userInput}</dd>
        </div>
        <div>
          <dt>OCR Reading</dt>
          <dd>{result.ocr}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{result.confidence}%</dd>
        </div>
        <div>
          <dt>Difference</dt>
          <dd>{result.difference}</dd>
        </div>
      </dl>
    </div>
  );
}

function ReportTable() {
  return (
    <section className="reportBand">
      <div className="sectionHeader">
        <div>
          <p className="panelKicker">Excel Exception Report</p>
          <h2>Exception Queue</h2>
        </div>
        <button className="secondaryButton">
          <Download size={17} />
          <span>XLSX</span>
        </button>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Image Name</th>
              <th>Vessel</th>
              <th>Capture Date</th>
              <th>User Input</th>
              <th>OCR Reading</th>
              <th>Difference</th>
              <th>Confidence</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.image}>
                <td>{row.image}</td>
                <td>{row.vessel}</td>
                <td>{row.date}</td>
                <td>{row.input}</td>
                <td>{row.ocr}</td>
                <td>{row.diff}</td>
                <td>{row.confidence}</td>
                <td><span className={`tableStatus ${row.status.toLowerCase()}`}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FloatingAssistant({ context }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'ถามข้อมูลเกี่ยวกับรูป OCR, สถานะ, ตัวเลขที่อ่านได้ หรือเหตุผลที่ขึ้น FAIL ได้เลย'
    }
  ]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || isThinking) return;

    setInput('');
    setIsThinking(true);
    setMessages((current) => [...current, { role: 'user', content: question }]);

    try {
      const answer = await askTyphoonAssistant(question, context);
      setMessages((current) => [...current, { role: 'assistant', content: answer }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: error.message || 'เรียก Typhoon assistant ไม่สำเร็จ'
        }
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="assistantDock">
      {isOpen && (
        <section className="assistantPanel" aria-label="OCR assistant">
          <div className="assistantHeader">
            <div>
              <p className="panelKicker">Typhoon Assistant</p>
              <h2>Ask OCR Data</h2>
            </div>
            <button className="iconButton" type="button" onClick={() => setIsOpen(false)} aria-label="Close assistant">
              <X size={18} />
            </button>
          </div>
          <div className="assistantMessages">
            {messages.map((message, index) => (
              <div className={`chatBubble ${message.role}`} key={`${message.role}-${index}`}>
                {message.content}
              </div>
            ))}
            {isThinking && <div className="chatBubble assistant">กำลังคิด...</div>}
          </div>
          <form className="assistantComposer" onSubmit={handleSubmit}>
            <input
              aria-label="Ask assistant"
              placeholder="ถามข้อมูล..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button className="assistantSend" type="submit" aria-label="Send question" disabled={!input.trim() || isThinking}>
              <Send size={18} />
            </button>
          </form>
        </section>
      )}

      <button
        className="assistantFab"
        type="button"
        aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
        title={isOpen ? 'Close assistant' : 'Open assistant'}
        onClick={() => setIsOpen((value) => !value)}
      >
        {isOpen ? <X size={26} /> : <MessageCircle size={28} />}
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
