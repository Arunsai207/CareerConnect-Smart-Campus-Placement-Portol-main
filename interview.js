const questions = [
  "Tell me about yourself and why you are a strong fit for this placement opportunity.",
  "Describe a challenging project you worked on and how you contributed to the outcome.",
  "How do you handle pressure, deadlines, and conflicting priorities in a team environment?",
  "What are your strengths and how do they align with this role or internship?",
  "Why do you want to join our company, and what motivates your career goals?"
];

const state = {
  interviewStarted: false,
  questionIndex: 0,
  timer: 0,
  timerId: null,
  mediaReady: false,
  recognition: null,
  listening: false,
  transcript: []
};

const transcriptList = document.getElementById('transcriptList');
const questionText = document.getElementById('questionText');
const liveStatus = document.getElementById('liveStatus');
const timerEl = document.getElementById('timerValue');
const addTranscriptEntry = (speaker, text) => {
  const item = document.createElement('div');
  item.className = `transcript-entry ${speaker === 'AI' ? 'ai' : ''}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  item.innerHTML = `
    <div class="user-avatar">${speaker === 'AI' ? 'AI' : 'You'}</div>
    <div>
      <div><span class="msg-time">${time}</span><strong>${speaker}</strong></div>
      <div>${text}</div>
    </div>
  `;
  transcriptList.appendChild(item);
  transcriptList.scrollTop = transcriptList.scrollHeight;
};

const updateTimer = () => {
  const minutes = String(Math.floor(state.timer / 60)).padStart(2, '0');
  const seconds = String(state.timer % 60).padStart(2, '0');
  timerEl.textContent = `${minutes}:${seconds}`;
};

const startTimer = () => {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    state.timer += 1;
    updateTimer();
  }, 1000);
};

const stopTimer = () => {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
};

const speakQuestion = (text) => {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
};

const askQuestion = () => {
  const current = questions[state.questionIndex];
  if (!current) return;
  questionText.textContent = current;
  addTranscriptEntry('AI', current);
  speakQuestion(current);
  setStatus('Question in progress');
  startListening();
};

const setStatus = (message) => {
  liveStatus.textContent = message;
};

const nextQuestion = () => {
  if (state.questionIndex < questions.length - 1) {
    state.questionIndex += 1;
    askQuestion();
  } else {
    state.questionIndex = 0;
    setStatus('Interview complete');
    questionText.textContent = 'Thank you. Your interview session has finished. Please review the summary and score metrics.';
    stopListening();
    stopTimer();
    addTranscriptEntry('AI', 'Interview session summary ready. Great job.');
  }
};

const ensureMedia = async () => {
  if (state.mediaReady) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    const localVideo = document.getElementById('localVideo');
    localVideo.srcObject = stream;
    localVideo.play();
    state.mediaReady = true;
    setStatus('Camera and microphone are live');
    document.getElementById('cameraState').textContent = 'Ready';
    document.getElementById('micState').textContent = 'Active';
  } catch (error) {
    setStatus('Camera and mic permission required');
    console.error('Media access error:', error);
  }
};

const initializeSpeechRecognition = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus('Browser speech recognition is not available');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onstart = () => {
    state.listening = true;
    setStatus('Listening for your response');
  };

  recognition.onresult = (event) => {
    let finalText = '';
    let interimText = '';
    for (let i = 0; i < event.results.length; i += 1) {
      const transcriptChunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += transcriptChunk + ' ';
      } else {
        interimText += transcriptChunk;
      }
    }

    if (finalText.trim()) {
      addTranscriptEntry('You', finalText.trim());
      setStatus('Answer captured');
    }

    if (interimText.trim()) {
      document.getElementById('liveStatus').textContent = `Listening: ${interimText.trim()}`;
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    setStatus('Microphone listening issue');
  };

  recognition.onend = () => {
    if (state.listening) {
      setTimeout(() => {
        if (state.interviewStarted) {
          recognition.start();
        }
      }, 400);
    }
  };

  state.recognition = recognition;
  return recognition;
};

const startListening = () => {
  if (!state.recognition) {
    initializeSpeechRecognition();
  }

  if (state.recognition) {
    try {
      state.recognition.start();
    } catch (error) {
      console.warn('Speech recognition already started');
    }
  }
};

const stopListening = () => {
  state.listening = false;
  if (state.recognition) {
    try {
      state.recognition.stop();
    } catch (error) {
      console.warn('Speech recognition stop warning', error);
    }
  }
};

const beginInterview = async () => {
  state.interviewStarted = true;
  await ensureMedia();
  if (!state.recognition) {
    initializeSpeechRecognition();
  }
  state.timer = 0;
  updateTimer();
  startTimer();
  askQuestion();
};

const addManualResponse = () => {
  const input = document.getElementById('answerInput');
  const text = input.value.trim();
  if (!text) return;
  addTranscriptEntry('You', text);
  input.value = '';
  setStatus('Answer submitted');
  setTimeout(() => nextQuestion(), 1200);
};

document.getElementById('startInterviewBtn').addEventListener('click', beginInterview);
document.getElementById('nextQuestionBtn').addEventListener('click', () => {
  if (state.interviewStarted) {
    nextQuestion();
  }
});
document.getElementById('sendAnswerBtn').addEventListener('click', addManualResponse);
document.getElementById('answerInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    addManualResponse();
  }
});
document.getElementById('stopInterviewBtn').addEventListener('click', () => {
  state.interviewStarted = false;
  stopListening();
  stopTimer();
  setStatus('Interview paused');
  addTranscriptEntry('AI', 'Interview paused. You can resume when ready.');
});

document.getElementById('toggleMicBtn').addEventListener('click', () => {
  if (state.listening) {
    stopListening();
    setStatus('Microphone paused');
  } else {
    startListening();
  }
});

initializeSpeechRecognition();
updateTimer();
addTranscriptEntry('AI', 'Welcome. Click Start Interview to begin your mock interview session.');
questionText.textContent = 'Your interview question will appear here.';
