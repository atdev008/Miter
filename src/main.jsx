import React, { useMemo, useState } from 'react';
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
  ScanLine,
  Search,
  Server,
  SlidersHorizontal,
  Upload,
  User,
  X
} from 'lucide-react';
import './styles.css';

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

function extractMeterDigits(value = '') {
  const normalizedText = String(value).replace(/[๐-๙]/g, (digit) => thaiDigits[digit] || digit);
  const candidates = normalizedText.match(/[0-9OoIl|][0-9OoIl|,\s.\-]{1,}[0-9OoIl|]/g) || [];
  const digitCandidates = candidates
    .map(normalizeDigits)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  return digitCandidates[0] || normalizeDigits(normalizedText);
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
              text: 'Extract only the fuel meter reading digits from this image. Return compact JSON only: {"digits":"...", "confidence": 0-100}. If no meter reading is visible, use {"digits":"", "confidence":0}.'
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

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [active, setActive] = useState(0);
  const [selectedFile, setSelectedFile] = useState('FM-20260604-002.jpg');
  const [userInput, setUserInput] = useState('099240');
  const [uploadedImage, setUploadedImage] = useState('');
  const [ocrState, setOcrState] = useState({
    status: 'idle',
    digits: '099248',
    confidence: 93.1,
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
    const userDigits = normalizeDigits(userInput);
    const ocrDigits = normalizeDigits(ocr);
    let status = 'PROCESSING';
    let difference = '-';

    if (isError && active >= 3) {
      status = 'ERROR';
    } else if (active >= 3 && hasOcrResult) {
      if (!ocrDigits) {
        status = 'NO_METER_FOUND';
      } else if (confidence > 0 && confidence < 85) {
        status = 'LOW_CONFIDENCE';
      } else {
        status = ocrDigits === userDigits ? 'PASS' : 'FAIL';
      }
    } else if (isReading) {
      status = 'PROCESSING';
    }

    if (active >= 5 && ocrDigits && userDigits) {
      const diffValue = Number(ocrDigits) - Number(userDigits);
      difference = diffValue > 0 ? `+${diffValue}` : String(diffValue);
    }

    return { confidence, ocr, status, difference, error: ocrState.error };
  }, [active, ocrState, userInput]);

  const handleImageUpload = async (file) => {
    setSelectedFile(file.name);
    setActive(3);
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

  const goBack = () => setActive((value) => Math.max(0, value - 1));
  const goNext = () => setActive((value) => Math.min(steps.length - 1, value + 1));

  if (!isAuthenticated) {
    return <LoginPage onLogin={(username) => {
      setCurrentUser(username);
      setIsAuthenticated(true);
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
              setIsAuthenticated(false);
              setCurrentUser('');
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
      {steps.slice(0, 6).map((step, index) => {
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
  ocrState
}) {
  if (active === 0) {
    return (
      <div className="stepBody uploadGrid">
        <label className="dropZone">
          <Image size={30} />
          <span>{selectedFile}</span>
          {ocrState.status === 'reading' && <small>Reading digits with Typhoon OCR...</small>}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                setSelectedFile(file.name);
                onImageUpload(file);
              }
            }}
          />
        </label>
        <div className="formStack">
          <label>
            Vessel
            <input value="MT Chao Phraya" readOnly />
          </label>
          <label>
            Capture Date
            <input value="2026-06-04 08:27" readOnly />
          </label>
          <label>
            User Input
            <input value={userInput} onChange={(event) => setUserInput(event.target.value)} inputMode="numeric" />
          </label>
        </div>
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
    const digitsOnly = /^\d+$/.test(result.ocr);
    const lengthValid = result.ocr.length >= 4;
    const confidenceValid = result.confidence >= 85 || result.confidence === 0;

    return (
      <div className="stepBody validationList">
        <ValidationLine label="Digits only" pass={digitsOnly} detail="OCR candidate is numeric after correction review" />
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

createRoot(document.getElementById('root')).render(<App />);
