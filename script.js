/* ========================================
   PBST APP - COMPLETE SCRIPT
======================================== */

const firebaseConfig = {
    apiKey: "AIzaSyDxT6Xmk1m95VRoN6q_AwtO58JdhSU3tz4",
    authDomain: "pbst-app.firebaseapp.com",
    databaseURL: "https://pbst-app-default-rtdb.firebaseio.com",
    projectId: "pbst-app",
    storageBucket: "pbst-app.firebasestorage.app",
    messagingSenderId: "274629546362",
    appId: "1:274629546362:web:b898851bec5ecaa3f086c3",
    measurementId: "G-MVYFBVFBG3"
};

const CLOUDINARY_CLOUD_NAME = "qw10sgez";
const CLOUDINARY_UPLOAD_PRESET = "pdst_unsigned";

let auth = null;
let db = null;
let currentUser = null;
let currentVideoId = null;
let selectedVideoFile = null;
let videos = [];
let quizIndex = 0;
let selectedAnswer = null;
let correctAnswers = 0;
let quizFinished = false;
let rewarded = false;
let videoListener = null;
let likesListener = null;
let commentsListener = null;

let coins = Number(localStorage.getItem("pbst_coins") || 0);
let answeredQuestions = Number(
    localStorage.getItem("pbst_correct_answers") || 0
);

let localLikes = readJSON("pbst_likes", {});
let localComments = readJSON("pbst_comments", {});

function $(id) {
    return document.getElementById(id);
}

function readJSON(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
        return fallback;
    }
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[c]);
}

function showMessage(message) {
    let box = $("pbstMessage");

    if (!box) {
        box = document.createElement("div");
        box.id = "pbstMessage";

        Object.assign(box.style, {
            position: "fixed",
            left: "15px",
            right: "15px",
            bottom: "95px",
            zIndex: "20000",
            padding: "14px",
            borderRadius: "12px",
            background: "#222",
            color: "#fff",
            border: "1px solid #ff851b",
            textAlign: "center",
            lineHeight: "1.5"
        });

        document.body.appendChild(box);
    }

    box.textContent = message;
    box.classList.remove("hidden");

    clearTimeout(box.timer);

    box.timer = setTimeout(() => {
        box.classList.add("hidden");
    }, 4000);
}

/* ========================================
   SHOW APP QUICKLY
======================================== */

function revealHome() {
    const splash = $("splashScreen");
    const app = $("app");

    if (splash) splash.classList.add("fade-out");
    if (app) app.classList.remove("hidden");

    if (splash) {
        setTimeout(() => {
            splash.style.display = "none";
        }, 550);
    }

    if ($("coinCount")) {
        $("coinCount").textContent = coins;
    }
}

/* ========================================
   FIREBASE
======================================== */

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");

        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(
            new Error("Firebase SDK load failed")
        );

        document.head.appendChild(script);
    });
}

async function initializeFirebase() {
    try {
        await loadScript(
            "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"
        );

        await loadScript(
            "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"
        );

        await loadScript(
            "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"
        );

        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        auth = firebase.auth();
        db = firebase.database();

        createLoginButton();

        auth.onAuthStateChanged(async user => {
            currentUser = user || null;
            updateLoginButton();

            if (user) {
                await loadUserProgress();
                listenForVideos();
            } else {
                stopVideoListener();
            }
        });

    } catch (error) {
        console.error("Firebase:", error);
        showMessage(
            "Firebase कनेक्ट नहीं हुआ। आप होम स्क्रीन इस्तेमाल कर सकते हैं।"
        );
    }
}

/* ========================================
   GOOGLE LOGIN
======================================== */

function createLoginButton() {
    if ($("googleLoginButton")) return;

    const header = document.querySelector(".app-header");
    if (!header) return;

    const button = document.createElement("button");

    button.id = "googleLoginButton";
    button.textContent = "Google Login";

    Object.assign(button.style, {
        display: "block",
        margin: "8px 16px 0 auto",
        padding: "9px 12px",
        border: "1px solid #ff851b",
        borderRadius: "10px",
        background: "#171717",
        color: "#ffad52",
        fontWeight: "bold"
    });

    button.onclick = handleGoogleLogin;

    header.insertAdjacentElement("afterend", button);

    updateLoginButton();
}

function updateLoginButton() {
    const button = $("googleLoginButton");
    if (!button) return;

    button.textContent = currentUser
        ? "Google Logout"
        : "Google Login";
}

async function handleGoogleLogin() {
    if (!auth) {
        showMessage("Firebase अभी तैयार नहीं है।");
        return;
    }

    try {
        if (currentUser) {
            await auth.signOut();
            showMessage("आप लॉग आउट हो गए।");
            return;
        }

        const provider = new firebase.auth.GoogleAuthProvider();

        // Redirect की जगह popup से Login करने की कोशिश
        const result = await auth.signInWithPopup(provider);

        currentUser = result.user;
        updateLoginButton();

        await loadUserProgress();
        listenForVideos();

        showMessage("Google Login सफल हुआ!");
    } catch (error) {
        console.error("Google Login Error:", error);

        if (
            error.code === "auth/popup-blocked" ||
            error.code === "auth/popup-closed-by-user"
        ) {
            showMessage("Login popup बंद हो गया। दोबारा कोशिश करें।");
        } else {
            showMessage("Login समस्या: " + error.message);
        }
    }
}

/* ========================================
   COINS AND PROGRESS
======================================== */

function saveCoins() {
    localStorage.setItem("pbst_coins", String(coins));

    localStorage.setItem(
        "pbst_correct_answers",
        String(answeredQuestions)
    );

    if ($("coinCount")) {
        $("coinCount").textContent = coins;
    }

    if (currentUser && db) {
        db.ref("users/" + currentUser.uid + "/progress")
            .update({
                coins,
                answeredQuestions,
                updatedAt: Date.now()
            })
            .catch(error => console.warn(error));
    }
}

async function loadUserProgress() {
    if (!currentUser || !db) return;

    try {
        const snapshot = await db.ref(
            "users/" + currentUser.uid + "/progress"
        ).once("value");

        if (snapshot.exists()) {
            const progress = snapshot.val();

            coins = Number(progress.coins || 0);
            answeredQuestions = Number(
                progress.answeredQuestions || 0
            );

            localStorage.setItem("pbst_coins", String(coins));

            localStorage.setItem(
                "pbst_correct_answers",
                String(answeredQuestions)
            );

            if ($("coinCount")) {
                $("coinCount").textContent = coins;
            }
        }
    } catch (error) {
        console.warn("Progress sync unavailable:", error);
    }
}

/* ========================================
   PAGE NAVIGATION
======================================== */

function showPage(pageName) {
    const pages = {
        home: $("homeScreen"),
        tasks: $("tasksScreen"),
        upload: $("uploadScreen")
    };

    Object.entries(pages).forEach(([name, page]) => {
        if (!page) return;

        page.classList.toggle("hidden", name !== pageName);
        page.classList.toggle("active", name === pageName);
    });

    document.querySelectorAll(".nav-item").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === pageName
        );
    });

    if (pageName === "tasks" && !quizFinished) {
        renderQuestion();
    }
}

function openTasks() {
    quizIndex = 0;
    selectedAnswer = null;
    correctAnswers = 0;
    quizFinished = false;
    rewarded = false;

    $("quizCard").classList.remove("hidden");
    $("quizResult").classList.add("hidden");

    renderQuestion();
    showPage("tasks");
}

/* ========================================
   QUIZ
======================================== */

const questions = [
    {
        category: "PSYCHOLOGY",
        question: "Which habit helps you learn effectively?",
        options: [
            "Never reviewing lessons",
            "Practising and reviewing regularly",
            "Learning everything at once",
            "Avoiding questions"
        ],
        answer: 1,
        explanation: "Regular practice strengthens learning."
    },
    {
        category: "BUSINESS",
        question: "What should a business understand first?",
        options: [
            "Customer needs",
            "Only its logo",
            "How to avoid feedback",
            "How to copy everyone"
        ],
        answer: 0,
        explanation: "Understanding customers helps solve real problems."
    },
    {
        category: "SUCCESS",
        question: "How can you approach a big goal?",
        options: [
            "Wait for motivation",
            "Ignore your progress",
            "Break it into small steps",
            "Change it every hour"
        ],
        answer: 2,
        explanation: "Small consistent steps help achieve large goals."
    }
];

function renderQuestion() {
    if (quizFinished) return;

    const q = questions[quizIndex];
    if (!q) return finishQuiz();

    selectedAnswer = null;

    $("questionNumber").textContent =
        `QUESTION ${quizIndex + 1} OF ${questions.length}`;

    $("questionCategory").textContent = q.category;
    $("questionText").textContent = q.question;

    $("quizProgress").style.width =
        `${quizIndex / questions.length * 100}%`;

    $("answerFeedback").textContent = "";
    $("answerFeedback").className = "answer-feedback";

    $("nextButton").disabled = true;
    $("nextButton").textContent = "Check Answer";

    delete $("nextButton").dataset.checked;

    $("answerOptions").innerHTML = "";

    q.options.forEach((option, index) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "answer-option";
        button.textContent = option;

        button.onclick = () => {
            if (selectedAnswer !== null) return;

            selectedAnswer = index;

            document.querySelectorAll(".answer-option")
                .forEach(item => item.classList.remove("selected"));

            button.classList.add("selected");
            $("nextButton").disabled = false;
        };

        $("answerOptions").appendChild(button);
    });
}

function checkAnswer() {
    if (selectedAnswer === null || quizFinished) return;

    const q = questions[quizIndex];

    document.querySelectorAll(".answer-option").forEach(
        (button, index) => {
            button.disabled = true;

            if (index === q.answer) {
                button.classList.add("correct");
            } else if (index === selectedAnswer) {
                button.classList.add("wrong");
            }
        }
    );

    const feedback = $("answerFeedback");

    if (selectedAnswer === q.answer) {
        correctAnswers++;

        feedback.textContent = "Correct! " + q.explanation;
        feedback.classList.add("success");
    } else {
        feedback.textContent = "Not quite. " + q.explanation;
        feedback.classList.add("error");
    }

    $("nextButton").textContent =
        quizIndex === questions.length - 1
            ? "See Results"
            : "Next Question";

    $("nextButton").dataset.checked = "true";
    $("nextButton").disabled = false;
}

function nextQuestion() {
    if ($("nextButton").dataset.checked !== "true") {
        checkAnswer();
        return;
    }

    delete $("nextButton").dataset.checked;

    quizIndex++;

    if (quizIndex < questions.length) {
        renderQuestion();
    } else {
        finishQuiz();
    }
}

function finishQuiz() {
    if (rewarded) return;

    quizFinished = true;
    rewarded = true;

    const earned =
        correctAnswers === 3 ? 2 :
        correctAnswers === 2 ? 1 : 0;

    coins += earned;
    answeredQuestions += correctAnswers;

    saveCoins();

    $("quizCard").classList.add("hidden");
    $("quizResult").classList.remove("hidden");

    $("correctCount").textContent = correctAnswers;
    $("earnedCoins").textContent = `You earned ${earned} coins!`;

    $("resultTitle").textContent =
        correctAnswers === 3
            ? "Excellent work!"
            : "Challenge complete";

    $("resultMessage").textContent =
        "Keep learning to build your knowledge.";
}

function restartQuiz() {
    openTasks();
}

/* ========================================
   CLOUDINARY UPLOAD
======================================== */

function setupVideoSelection() {
    const input = $("videoInput");
    if (!input) return;

    input.addEventListener("change", () => {
        const file = input.files[0];
        if (!file) return;

        if (!file.type.startsWith("video/")) {
            showMessage("कृपया वीडियो फाइल चुनें।");
            input.value = "";
            return;
        }

        selectedVideoFile = file;

        $("previewVideo").src = URL.createObjectURL(file);
        $("selectedVideoName").textContent = file.name;
        $("uploadPreview").classList.remove("hidden");
    });

    $("addVideoButton").addEventListener("click", addVideo);
}

async function uploadToCloudinary(file) {
    const form = new FormData();

    form.append("file", file);
    form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`,
        {
            method: "POST",
            body: form
        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.error?.message || "Cloudinary upload failed"
        );
    }

    return result.secure_url;
}

async function addVideo() {
    if (!selectedVideoFile) {
        showMessage("पहले वीडियो चुनो।");
        return;
    }

    const button = $("addVideoButton");

    button.disabled = true;
    button.textContent = "Uploading...";

    try {
        const url = await uploadToCloudinary(selectedVideoFile);

        const video = {
            url,
            title: selectedVideoFile.name,
            uid: currentUser ? currentUser.uid : null,
            userName: currentUser
                ? currentUser.displayName || "PBST User"
                : "PBST User",
            createdAt: Date.now()
        };

        if (currentUser && db) {
            const ref = db.ref("videos").push();
            video.id = ref.key;

            await ref.set(video);

            showMessage("वीडियो Feed में शेयर हो गया!");
        } else {
            video.id = "local_" + Date.now();

            videos.unshift(video);
            renderVideoFeed();

            showMessage(
                "वीडियो इस डिवाइस पर जुड़ गया। ऑनलाइन शेयर करने के लिए Google Login करें।"
            );
        }

        $("videoInput").value = "";
        selectedVideoFile = null;

        $("uploadPreview").classList.add("hidden");
        showPage("home");

    } catch (error) {
        console.error(error);

        showMessage(
            "अपलोड नहीं हुआ: " + (error.message || "सेटिंग जाँचें।")
        );
    } finally {
        button.disabled = false;
        button.textContent = "Add to My Feed";
    }
}

/* ========================================
   VIDEO FEED
======================================== */

function stopVideoListener() {
    if (db && videoListener) {
        db.ref("videos").off("value", videoListener);
    }

    videoListener = null;
}

function listenForVideos() {
    if (!db || !currentUser) return;

    stopVideoListener();

    videoListener = snapshot => {
        const cloudVideos = [];

        snapshot.forEach(child => {
            cloudVideos.push({
                id: child.key,
                ...child.val()
            });
        });

        cloudVideos.sort(
            (a, b) => Number(b.createdAt || 0) -
                      Number(a.createdAt || 0)
        );

        const localVideos = videos.filter(
            video => String(video.id).startsWith("local_")
        );

        videos = [...localVideos, ...cloudVideos];

        renderVideoFeed();
    };

    db.ref("videos").on("value", videoListener, error => {
        console.error(error);

        showMessage(
            "ऑनलाइन Feed नहीं खुला। Firebase Database Rules जाँचें।"
        );
    });
}

function renderVideoFeed() {
    const feed = $("videoFeed");
    if (!feed) return;

    if (!videos.length) {
        feed.innerHTML = `
            <div class="empty-feed">
                <div class="empty-feed-icon"></div>
                <h4>Your feed starts here</h4>
                <p>Videos you add will appear here.</p>
            </div>
        `;
        return;
    }

    feed.innerHTML = videos.map(video => `
        <article class="video-card"
            data-video-id="${escapeHTML(video.id)}">
            <div class="video-thumb">
                <video src="${escapeHTML(video.url)}"
                    preload="metadata" muted playsinline></video>
                <div class="play-overlay">▶</div>
            </div>
            <div class="video-card-info">
                <h4>${escapeHTML(video.title || "PBST Video")}</h4>
                <p>${escapeHTML(video.userName || "PBST Community")}</p>
            </div>
        </article>
    `).join("");

    feed.querySelectorAll(".video-card").forEach(card => {
        card.onclick = () => openVideo(card.dataset.videoId);
    });
}

function findVideo(id) {
    return videos.find(video => String(video.id) === String(id));
}

/* ========================================
   VIDEO VIEWER
======================================== */

function openVideo(id) {
    const video = findVideo(id);
    if (!video) return;

    currentVideoId = id;

    $("fullScreenVideo").src = video.url;
    $("videoViewer").classList.remove("hidden");
    $("commentPanel").classList.add("hidden");

    document.body.style.overflow = "hidden";

    updateVideoActions();
    attachSocialListeners();

    const promise = $("fullScreenVideo").play();
    if (promise) promise.catch(() => {});
}

function closeVideo() {
    detachSocialListeners();

    if ($("fullScreenVideo")) {
        $("fullScreenVideo").pause();
        $("fullScreenVideo").removeAttribute("src");
        $("fullScreenVideo").load();
    }

    $("videoViewer").classList.add("hidden");
    $("commentPanel").classList.add("hidden");

    document.body.style.overflow = "";

    currentVideoId = null;
}

/* ========================================
   BRAIN LIKE
======================================== */

async function toggleBrainLike() {
    if (!currentVideoId) return;

    const id = currentVideoId;

    if (currentUser && db) {
        try {
            const ref = db.ref(
                `videoLikes/${id}/${currentUser.uid}`
            );

            const snapshot = await ref.once("value");

            if (snapshot.val()) {
                await ref.remove();
            } else {
                await ref.set(true);
            }
        } catch (error) {
            console.error(error);

            showMessage(
                "Like सेव नहीं हुआ। Firebase Database Rules जाँचें।"
            );
        }
    } else {
        localLikes[id] = !localLikes[id];

        localStorage.setItem(
            "pbst_likes",
            JSON.stringify(localLikes)
        );

        updateVideoActions();
    }
}

function updateVideoActions() {
    if (!currentVideoId) return;

    const id = currentVideoId;

    $("brainLikeButton").classList.toggle(
        "liked",
        !!localLikes[id]
    );

    $("likeCount").textContent = localLikes[id] ? "1" : "0";

    $("commentCount").textContent =
        (localComments[id] || []).length;

    renderComments();
}

/* ========================================
   COMMENTS
======================================== */

function openComments() {
    if (!currentVideoId) return;

    $("commentPanel").classList.remove("hidden");

    renderComments();

    if (currentUser && db) {
        attachSocialListeners();
    }
}

function renderComments() {
    const list = $("commentList");
    if (!list || !currentVideoId) return;

    const comments = localComments[currentVideoId] || [];

    if (!comments.length) {
        list.innerHTML = `
            <p class="empty-comments">
                No comments yet. Start the conversation!
            </p>
        `;
        return;
    }

    list.innerHTML = comments.map(comment => `
        <div class="comment-item">
            <strong>${escapeHTML(comment.userName || "PBST User")}</strong>
            <p>${escapeHTML(comment.text || "")}</p>
        </div>
    `).join("");
}

async function postComment(event) {
    event.preventDefault();
  if (!currentVideoId) return;

    const input = $("commentInput");
    const text = input.value.trim();

    if (!text) return;

    const comment = {
        text,
        userName: currentUser
            ? currentUser.displayName || "PBST User"
            : "Guest",
        uid: currentUser ? currentUser.uid : null,
        createdAt: Date.now()
    };

    try {
        if (currentUser && db) {
            await db.ref(
                "videoComments/" + currentVideoId
            ).push(comment);
        } else {
            if (!localComments[currentVideoId]) {
                localComments[currentVideoId] = [];
            }

            localComments[currentVideoId].push(comment);

            localStorage.setItem(
                "pbst_comments",
                JSON.stringify(localComments)
            );
        }

        input.value = "";

        renderComments();

        $("commentCount").textContent =
            localComments[currentVideoId].length;

    } catch (error) {
        console.error(error);

        showMessage(
            "Comment सेव नहीं हुआ। Firebase Database Rules जाँचें।"
        );
    }
}

function detachSocialListeners() {
    if (!db || !currentVideoId) return;

    if (likesListener) {
        db.ref("videoLikes/" + currentVideoId)
            .off("value", likesListener);
    }

    if (commentsListener) {
        db.ref("videoComments/" + currentVideoId)
            .off("value", commentsListener);
    }

    likesListener = null;
    commentsListener = null;
}

function attachSocialListeners() {
    if (!db || !currentUser || !currentVideoId) return;

    detachSocialListeners();

    const videoId = currentVideoId;

    likesListener = snapshot => {
        if (currentVideoId !== videoId) return;

        const likes = snapshot.val() || {};

        $("likeCount").textContent = Object.values(likes)
            .filter(Boolean).length;

        $("brainLikeButton").classList.toggle(
            "liked",
            !!likes[currentUser.uid]
        );
    };

    commentsListener = snapshot => {
        if (currentVideoId !== videoId) return;

        const comments = [];

        snapshot.forEach(child => {
            comments.push({
                id: child.key,
                ...child.val()
            });
        });

        comments.sort(
            (a, b) => Number(a.createdAt || 0) -
                      Number(b.createdAt || 0)
      ;

        localComments[videoId] = comments;

        renderComments();

        $("commentCount").textContent = comments.length;
    };

    db.ref("videoLikes/" + videoId).on(
        "value",
        likesListener,
        error => console.warn("Likes unavailable:", error)
    );

    db.ref("videoComments/" + videoId).on(
        "value",
        commentsListener,
        error => console.warn("Comments unavailable:", error)
    );
}

/* ========================================
   EVENT LISTENERS
======================================== */

function setupEventListeners() {
    if ($("nextButton")) {
        $("nextButton").addEventListener("click", nextQuestion);
    }

    if ($("closeViewer")) {
        $("closeViewer").addEventListener("click", closeVideo);
    }

    if ($("brainLikeButton")) {
        $("brainLikeButton").addEventListener(
            "click",
            toggleBrainLike
        );
    }

    if ($("commentButton")) {
        $("commentButton").addEventListener(
            "click",
            openComments
        );
    }

    if ($("closeComments")) {
        $("closeComments").addEventListener("click", () => {
            $("commentPanel").classList.add("hidden");
        });
    }

    if ($("commentForm")) {
        $("commentForm").addEventListener(
            "submit",
            postComment
        );
    }

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && currentVideoId) {
            closeVideo();
        }
    });
}

/* ========================================
   APP START
======================================== */

function startApp() {
    if ($("coinCount")) {
        $("coinCount").textContent = coins;
    }

    setupEventListeners();
    setupVideoSelection();

    // Home screen opens even if Firebase is slow.
    setTimeout(revealHome, 1000);

    // Firebase loads separately and never blocks the home screen.
    initializeFirebase();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApp);
} else {
    startApp();
}                       
