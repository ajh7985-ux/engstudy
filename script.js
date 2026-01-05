// DOM Elements
const screens = {
    welcome: document.getElementById('welcome-screen'),
    learning: document.getElementById('learning-screen'),
    quiz: document.getElementById('quiz-screen'),
    result: document.getElementById('result-screen'),
    mastered: document.getElementById('mastered-screen'),
    incorrect: document.getElementById('incorrect-note-screen')
};

// State
let currentLevel = 'easy';
let learningWords = [];
let currentIndex = 0;
let quizScore = 0;
let currentQuizQuestionIndex = 0;
let quizQuestions = []; // Array of { wordObj, options }
let isIncorrectQuizMode = false; // Flag for special quiz mode

// Sound Effects
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const playSound = (type) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'correct') {
        // Ding (High pitch sine)
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
    } else if (type === 'wrong') {
        // Beep (Low pitch saw/square)
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
        oscillator.frequency.linearRampToValueAtTime(100, audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    }
};

let speechVoices = [];

const initVoices = () => {
    speechVoices = window.speechSynthesis.getVoices();
};

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = initVoices;
    initVoices();
}

const speak = (text) => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';

        const usVoices = speechVoices.filter(v => v.lang.includes('en-US'));
        if (usVoices.length > 0) {
            const bestVoice = usVoices.find(v =>
                v.name.includes('Premium') ||
                v.name.includes('Enhanced') ||
                v.name.includes('Natural') ||
                v.name.includes('Samantha') ||
                v.name.includes('Google')
            ) || usVoices[0];

            utterance.voice = bestVoice;
        }

        utterance.rate = 0.95;
        utterance.pitch = 1.0;

        window.speechSynthesis.speak(utterance);
    }
};

// Utils
const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const showScreen = (screenName) => {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    Object.values(screens).forEach(screen => screen.classList.add('hidden'));

    // Some screens might be missing from the object if I didn't update the ref?
    // Let's re-fetch screens just in case to be safe or ensure DOM is ready.
    // Actually screens const is top level.

    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden');
        setTimeout(() => {
            screens[screenName].classList.add('active');
        }, 10);
    }
};

// --- Initialization ---
document.querySelectorAll('.difficulty-buttons .btn').forEach(btn => {
    btn.addEventListener('click', () => {
        currentLevel = btn.dataset.level;
        startLearningPhase();
    });
});

document.getElementById('btn-restart').addEventListener('click', () => {
    showScreen('welcome');
});

// New Buttons
document.getElementById('btn-view-history').addEventListener('click', () => {
    showHistoryView();
});

document.getElementById('btn-view-mastered').addEventListener('click', () => {
    showMasteredView();
});

document.getElementById('btn-mastered-back').addEventListener('click', () => {
    showScreen('welcome');
});

document.getElementById('btn-view-incorrect').addEventListener('click', () => {
    showIncorrectNoteView();
});

document.getElementById('btn-incorrect-back').addEventListener('click', () => {
    showScreen('welcome');
});

document.getElementById('btn-start-incorrect-test').addEventListener('click', () => {
    startIncorrectQuiz();
});

document.getElementById('btn-reset-data').addEventListener('click', () => {
    if (confirm("나의기록, 완벽단어암기장, 오답노트 등\n모든 정보를 삭제 하시겠습니까?")) {
        localStorage.removeItem('vocabAppHistory');
        localStorage.removeItem('vocabAppMastery');
        localStorage.removeItem('vocabAppIncorrect');
        alert("모든 정보가 삭제되었습니다.");
    }
});

document.getElementById('btn-learning-back').addEventListener('click', () => {
    showScreen('welcome');
});

// Checkbox Listeners
document.querySelectorAll('.custom-checkbox').forEach(box => {
    box.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        const currentWordObj = learningWords[currentIndex];

        // Logic: specific level toggle
        // If clicking 2 and current is 2, toggle to 0? Or maybe 1? 
        // Let's do: toggle off if clicking the exact current level, otherwise set to clicked level.
        const currentData = getMasteryData();
        const currentLevel = currentData[currentWordObj.word] || 0;

        let newLevel = index;
        if (currentLevel === index) {
            newLevel = 0; // Toggle off if clicked same level
        }

        setMastery(currentWordObj.word, newLevel);
        updateLearningUI(); // Re-render to show change
    });
});

// Filter Button Listeners
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const filter = e.target.dataset.filter;

        // Update Active State
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        // Re-render Chart
        renderChart(filter);
    });
});

// --- Learning Phase ---
const startLearningPhase = () => {
    // 1. Filter words
    // Mastery Check: Exclude words with >= 2 mastery
    const masteryData = getMasteryData();
    let candidates = wordData.filter(item => item.level === currentLevel);

    // Filter out mastered
    let unmastered = candidates.filter(w => (masteryData[w.word] || 0) < 3);

    if (unmastered.length === 0) {
        // If all mastered, maybe show a message or just use all candidates
        if (confirm("이 난이도의 모든 단어를 마스터했습니다! 복습을 위해 모든 단어로 학습하시겠습니까?")) {
            learningWords = candidates;
        } else {
            return;
        }
    } else if (unmastered.length < 5) { // If very few left, mix in some mastered ones for volume?
        // Just use what's left
        learningWords = unmastered;
    } else {
        learningWords = unmastered;
    }

    if (learningWords.length === 0) {
        alert("데이터가 없습니다.");
        return;
    }

    // Shuffle for learning
    // learningWords = shuffleArray([...learningWords]); 

    currentIndex = 0;
    updateLearningUI();
    showScreen('learning');
};

const updateLearningUI = () => {
    const wordObj = learningWords[currentIndex];

    // Update Text
    document.getElementById('learn-word').textContent = wordObj.word;

    const meaningEl = document.getElementById('learn-meaning');
    meaningEl.textContent = wordObj.meaning;
    meaningEl.classList.remove('revealed'); // Reset blur on new word

    // Progress
    document.getElementById('learning-progress').textContent = `${currentIndex + 1} / ${learningWords.length}`;

    // Controls
    document.getElementById('btn-prev').disabled = currentIndex === 0;
    document.getElementById('btn-next').disabled = currentIndex === learningWords.length - 1;

    // Checkboxes State
    const masteryData = getMasteryData();
    const mLevel = masteryData[wordObj.word] || 0;

    document.querySelectorAll('.custom-checkbox').forEach(box => {
        const idx = parseInt(box.dataset.index);
        if (idx <= mLevel) {
            box.classList.add('checked');
        } else {
            box.classList.remove('checked');
        }
    });
};

// Learning Listeners
document.getElementById('btn-speak').addEventListener('click', () => {
    speak(learningWords[currentIndex].word);
});

document.querySelector('.meaning-area').addEventListener('click', () => {
    document.getElementById('learn-meaning').classList.toggle('revealed');
});

document.getElementById('btn-prev').addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex--;
        updateLearningUI();
    }
});

document.getElementById('btn-next').addEventListener('click', () => {
    if (currentIndex < learningWords.length - 1) {
        currentIndex++;
        updateLearningUI();
    }
});

document.getElementById('btn-start-test').addEventListener('click', () => {
    startQuizPhase();
});

// --- Quiz Phase ---
const startQuizPhase = () => {
    isIncorrectQuizMode = false;
    // Determine pool (same as learning was)
    // But we need exactly 20 or less.
    let pool = [...learningWords];

    // Pool should only consist of learningWords (unmastered)
    // We do NOT fill with mastered words to reach 20.
    // If pool is small (< 20), the test will just be shorter.

    const shuffledAll = shuffleArray(pool);
    const selectedWords = shuffledAll.slice(0, 20); // Pick 20

    // Prepare Questions (Word + 3 Distractors)
    quizQuestions = selectedWords.map(target => {
        // Find distractors (words that are NOT the target)
        const distractors = wordData // Use full wordData for better distractors
            .filter(w => w.level === currentLevel && w.word !== target.word)
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);

        // If not enough distractors (small dataset), fallback to all words
        if (distractors.length < 3) {
            const fallback = wordData
                .filter(w => w.word !== target.word)
                .sort(() => 0.5 - Math.random())
                .slice(0, 3);
            distractors.push(...fallback.slice(0, 3 - distractors.length));
        }

        const options = shuffleArray([target, ...distractors]);
        return {
            target: target,
            options: options
        };
    });

    currentQuizQuestionIndex = 0;
    quizScore = 0;
    updateQuizUI();
    showScreen('quiz');
};

document.getElementById('btn-quit').addEventListener('click', () => {
    if (confirm("테스트를 중단하고 나가시겠습니까? 점수는 저장되지 않습니다.")) {
        showScreen('welcome');
    }
});

const updateQuizUI = () => {
    const question = quizQuestions[currentQuizQuestionIndex];

    // Progress
    document.getElementById('quiz-count').textContent = `${currentQuizQuestionIndex + 1} / ${quizQuestions.length}`;
    const percent = ((currentQuizQuestionIndex) / quizQuestions.length) * 100;
    document.getElementById('quiz-progress-bar').style.width = `${percent}%`;

    // Question
    document.getElementById('quiz-word').textContent = question.target.word;

    // Auto speak? maybe only on click to avoid annoyance, but user asked for sound learning. 
    // For test, typically you read. Listening test is different. 
    // "테스트하는 영어단어 옆에는 어떻게 소리내는지 음성으로 들려줘" -> This implies during test too?
    // Let's add the button.

    // Options
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';

    question.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.classList.add('option-btn');
        btn.textContent = opt.meaning;
        btn.addEventListener('click', () => handleAnswer(opt, question.target, btn));
        optionsContainer.appendChild(btn);
    });
};

document.getElementById('quiz-speak').addEventListener('click', () => {
    const question = quizQuestions[currentQuizQuestionIndex];
    speak(question.target.word);
});

const handleAnswer = (selected, target, btnElement) => {
    // Disable all buttons
    const allBtns = document.querySelectorAll('.option-btn');
    allBtns.forEach(b => b.disabled = true);

    const isCorrect = selected.word === target.word;

    if (isCorrect) {
        playSound('correct');
        btnElement.classList.add('correct');
        quizScore++;
        updateMastery(target.word);
    } else {
        playSound('wrong');
        btnElement.classList.add('wrong');

        // Highlight correct answer
        allBtns.forEach(btn => {
            // Find the button that has the correct meaning
            if (btn.textContent === target.meaning) {
                btn.classList.add('correct');
            }
        });

        addToIncorrect(target.word);
    }

    if (isIncorrectQuizMode) {
        updateIncorrectProgress(target.word, isCorrect);
    }

    setTimeout(() => {
        currentQuizQuestionIndex++;
        if (currentQuizQuestionIndex < quizQuestions.length) {
            updateQuizUI();
        } else {
            showResult(true);
        }
    }, 1500);
};

// --- Result Phase ---
let scoreChartInstance = null;

const showResult = (isEndOfTest = false) => {
    const scoreArea = document.getElementById('result-score-area');
    const headerTitle = document.querySelector('#result-screen h2');

    if (isEndOfTest) {
        const totalQuestions = quizQuestions.length;
        // Avoid division by zero if empty (though unlikely)
        const finalScore = totalQuestions > 0 ? Math.round((quizScore / totalQuestions) * 100) : 0;

        document.getElementById('final-score').textContent = finalScore;
        document.getElementById('result-detail').textContent = `${totalQuestions}문제 중 ${quizScore}문제 정답`;

        const msgEl = document.getElementById('result-message');
        if (finalScore >= 90) msgEl.textContent = "완벽해요! 원어민 수준이네요! 🎉";
        else if (finalScore >= 70) msgEl.textContent = "참 잘했어요! 조금만 더 하면 만점! 💪";
        else if (finalScore >= 50) msgEl.textContent = "좋아요! 꾸준히 학습해보세요. 👍";
        else msgEl.textContent = "힘내세요! 다시 한 번 도전해볼까요? 🌱";

        // Save Score
        saveScore(finalScore);

        // Show Score Elements
        scoreArea.style.display = 'block';
        headerTitle.textContent = "테스트 결과";
    } else {
        // History View Mode
        // Hide Score Elements
        scoreArea.style.display = 'none';
        headerTitle.textContent = "나의 학습 기록";
    }

    // Initialize Filter Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === currentLevel) {
            btn.classList.add('active');
        }
    });

    // Render Chart
    renderChart(currentLevel);

    showScreen('result');
};

const showHistoryView = () => {
    showResult(false);
};

// --- Mastered Words View ---
const showMasteredView = () => {
    const list = document.getElementById('mastered-list');
    const noMsg = document.getElementById('no-mastered-msg');
    list.innerHTML = '';

    const masteryData = getMasteryData();
    // Get all words with mastery >= 3
    const masteredWords = wordData.filter(w => (masteryData[w.word] || 0) >= 3);

    if (masteredWords.length === 0) {
        noMsg.classList.remove('hidden');
    } else {
        noMsg.classList.add('hidden');
        masteredWords.forEach(w => {
            const item = document.createElement('div');
            item.classList.add('mastered-item');

            const wordSpan = document.createElement('span');
            wordSpan.classList.add('m-word');
            wordSpan.textContent = w.word;

            const meanSpan = document.createElement('span');
            meanSpan.classList.add('m-mean');
            meanSpan.textContent = w.meaning;

            const speakBtn = document.createElement('button');
            speakBtn.textContent = '🔊';
            speakBtn.classList.add('icon-btn', 'tiny-btn');
            speakBtn.addEventListener('click', () => speak(w.word));

            item.appendChild(wordSpan);
            item.appendChild(meanSpan);
            item.appendChild(speakBtn);
            list.appendChild(item);
        });
    }

    showScreen('mastered');
};

// --- Incorrect Answer Note View ---
const showIncorrectNoteView = () => {
    const list = document.getElementById('incorrect-list-area');
    const noMsg = document.getElementById('no-incorrect-msg');
    const startTestBtn = document.getElementById('btn-start-incorrect-test');

    list.innerHTML = '';

    const incorrectData = getIncorrectData();
    // Filter words that exist in incorrectData
    // incorrectData is { word: successCount }
    const words = Object.keys(incorrectData);

    if (words.length === 0) {
        noMsg.classList.remove('hidden');
        startTestBtn.style.display = 'none';
    } else {
        noMsg.classList.add('hidden');
        startTestBtn.style.display = 'block';

        words.forEach(wordText => {
            // Find full word object
            const w = wordData.find(item => item.word === wordText);
            if (!w) return; // Should not happen

            const item = document.createElement('div');
            item.classList.add('mastered-item');
            // Differentiate style slightly?
            item.style.borderColor = 'rgba(255, 107, 107, 0.3)';

            const wordSpan = document.createElement('span');
            wordSpan.classList.add('m-word');
            wordSpan.textContent = w.word;

            const meanSpan = document.createElement('span');
            meanSpan.classList.add('m-mean');
            meanSpan.textContent = w.meaning;

            // Success Count Indicator
            const countSpan = document.createElement('span');
            countSpan.style.fontSize = '0.8rem';
            countSpan.style.color = '#ff6b6b';
            countSpan.style.marginLeft = 'auto';
            countSpan.style.marginRight = '10px';
            countSpan.textContent = `(${incorrectData[wordText]}/3)`;

            const speakBtn = document.createElement('button');
            speakBtn.textContent = '🔊';
            speakBtn.classList.add('icon-btn', 'tiny-btn');
            speakBtn.addEventListener('click', () => speak(w.word));

            item.appendChild(wordSpan);
            item.appendChild(meanSpan);
            item.appendChild(countSpan);
            item.appendChild(speakBtn);
            list.appendChild(item);
        });
    }

    showScreen('incorrect');
};

const startIncorrectQuiz = () => {
    isIncorrectQuizMode = true;
    const incorrectData = getIncorrectData();
    const words = Object.keys(incorrectData);

    // Convert to word objects
    let pool = wordData.filter(w => words.includes(w.word));

    if (pool.length === 0) return; // Should not be accessible

    const shuffledAll = shuffleArray(pool);
    // Use all of them or limit? Let's use all for incorrect note test
    const selectedWords = shuffledAll;

    quizQuestions = selectedWords.map(target => {
        // Distractors: prefer other incorrect words, fallback to general
        let distractors = pool.filter(w => w.word !== target.word)
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);

        if (distractors.length < 3) {
            const fallback = wordData
                .filter(w => w.word !== target.word && !words.includes(w.word))
                .sort(() => 0.5 - Math.random())
                .slice(0, 3 - distractors.length);
            distractors.push(...fallback);
        }

        const options = shuffleArray([target, ...distractors]);
        return { target, options };
    });

    currentQuizQuestionIndex = 0;
    quizScore = 0;
    updateQuizUI();
    showScreen('quiz');
};


// Local Storage Logic
const saveScore = (score) => {
    const history = JSON.parse(localStorage.getItem('vocabAppHistory')) || [];
    const record = {
        date: new Date().toISOString(),
        score: score,
        level: currentLevel
    };
    history.push(record);
    localStorage.setItem('vocabAppHistory', JSON.stringify(history));
};

const getMasteryData = () => {
    return JSON.parse(localStorage.getItem('vocabAppMastery')) || {};
};

const updateMastery = (word) => {
    const data = getMasteryData();
    if (!data[word]) data[word] = 0;
    data[word]++;
    localStorage.setItem('vocabAppMastery', JSON.stringify(data));
};

const setMastery = (word, level) => {
    const data = getMasteryData();
    data[word] = level;
    if (level === 0) delete data[word]; // cleanup if 0
    localStorage.setItem('vocabAppMastery', JSON.stringify(data));
};

const getIncorrectData = () => {
    return JSON.parse(localStorage.getItem('vocabAppIncorrect')) || {};
};

const addToIncorrect = (word) => {
    const data = getIncorrectData();
    if (data[word] === undefined) { // Only add if not already there
        data[word] = 0; // 0 success count
        localStorage.setItem('vocabAppIncorrect', JSON.stringify(data));
    }
};

const updateIncorrectProgress = (word, isCorrect) => {
    if (!isCorrect) return; // Only track success for graduation

    const data = getIncorrectData();
    if (data[word] !== undefined) {
        data[word]++;
        if (data[word] >= 3) {
            delete data[word]; // Graduate!
            // Optional: maybe show toast?
        }
        localStorage.setItem('vocabAppIncorrect', JSON.stringify(data));
    }
};

const renderChart = (filterLevel = 'easy') => {
    const history = JSON.parse(localStorage.getItem('vocabAppHistory')) || [];

    // Filter by Level
    const filteredHistory = history.filter(item => item.level === filterLevel);

    // Last 10 attempts
    const recentHistory = filteredHistory.slice(-10);

    const startIndex = filteredHistory.length - recentHistory.length;

    const labels = recentHistory.map((item, index) => {
        return `${startIndex + index + 1}회`;
    });
    const dataPoints = recentHistory.map(item => item.score);

    const ctx = document.getElementById('scoreChart').getContext('2d');

    if (scoreChartInstance) {
        scoreChartInstance.destroy();
    }

    // Colors mapping
    const colors = {
        easy: '#00D2D3',
        medium: '#5f27cd',
        hard: '#ff9ff3'
    };
    const color = colors[filterLevel] || '#00D2D3';

    scoreChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `점수 기록 (${getKoreanLevel(filterLevel)})`,
                data: dataPoints,
                borderColor: color,
                backgroundColor: color + '33', // 20% opacity approx
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#fff',
                pointBorderColor: color,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#e0e0e0'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#e0e0e0'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e0e0e0'
                    }
                }
            }
        }
    });
};

const getKoreanLevel = (level) => {
    switch (level) {
        case 'easy': return '초급';
        case 'medium': return '중급';
        case 'hard': return '고급';
        default: return level;
    }
};
