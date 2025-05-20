// script.js
console.log("✅ script.js 로드됨");

// 0) 파일 input & 파일명 표시 영역 참조
const fileInput = document.getElementById('reference-file');
const selectedFilesEl = document.getElementById('selected-files');

// 0-1) 업로드된 파일을 누적해서 저장
let uploadedFiles = [];

// 0-2) 파일 선택 시 이벤트 처리
fileInput.addEventListener('change', () => {
  const newFiles = Array.from(fileInput.files);
  console.log('파일 선택됨 (input.files):', newFiles.map(f => f.name));

  // 새로 선택된 파일 추가 (중복 체크)
  newFiles.forEach(file => {
    if (!uploadedFiles.some(f => f.name === file.name)) {
      uploadedFiles.push(file);
    }
  });

  // 최대 3개 파일 유지
  if (uploadedFiles.length > 3) {
    uploadedFiles = uploadedFiles.slice(uploadedFiles.length - 3);
  }

  console.log('누적된 uploadedFiles:', uploadedFiles.map(f => f.name));

  // 선택된 파일명 표시
  if (uploadedFiles.length === 0) {
    selectedFilesEl.textContent = '선택된 파일 없음';
  } else {
    selectedFilesEl.textContent = '선택된 파일: ' + uploadedFiles.map(f => f.name).join(', ');
  }

  // input 초기화(같은 파일 재선택 허용)
  fileInput.value = '';
});

// ——————————————————————————————————
// 1) Firebase 인증 및 Knowledge 로드
// ——————————————————————————————————
const loginBtn   = document.getElementById("login-btn");
const logoutBtn  = document.getElementById("logout-btn");
const userInfo   = document.getElementById("user-info");
const knowledgeContainer = document.getElementById("knowledge-list");
const sendBtn    = document.getElementById("send-btn");

window._knowledge = [];

loginBtn.onclick = async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const { user } = await auth.signInWithPopup(provider);
    userInfo.innerText = `안녕하세요, ${user.displayName}님`;
    loginBtn.style.display  = "none";
    logoutBtn.style.display = "inline";
    window.userId = user.uid;
    loadKnowledge();
  } catch (err) {
    console.error("로그인 실패:", err);
    alert("로그인에 실패했습니다.");
  }
};

logoutBtn.onclick = async () => {
  await auth.signOut();
  userInfo.innerText      = "";
  logoutBtn.style.display = "none";
  loginBtn.style.display  = "inline";
  window.userId = null;
  knowledgeContainer.innerHTML = "";
  selectedFilesEl.textContent  = '선택된 파일 없음';
  uploadedFiles = [];
};

async function loadKnowledge() {
  if (!window.userId) return;
  knowledgeContainer.innerText = "로드 중...";
  try {
    const res = await fetch(`/knowledge?userId=${window.userId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    window._knowledge = data.knowledge;
    knowledgeContainer.innerHTML = window._knowledge.map((item, idx) => `
      <label style="display:block; margin-bottom:4px;">
        <input type="checkbox" data-idx="${idx}" checked />
        ${item.name}
      </label>
    `).join('');
  } catch (err) {
    console.error("Knowledge load error:", err);
    knowledgeContainer.innerText = "참고자료를 불러올 수 없습니다.";
  }
}

// ——————————————————————————————————
// 2) GPT 메시지 전송 로직
// ——————————————————————————————————
async function sendMessage() {
  if (!window.userId) {
    return alert("먼저 로그인 해주세요.");
  }
  const input = document.getElementById("user-input").value.trim();
  if (!input) {
    return alert("질문을 입력하세요.");
  }

  const responseBox = document.getElementById("response");
  responseBox.textContent = "응답 생성 중... 잠시만 기다려주세요.";

  const formData = new FormData();
  formData.append('message', input);
  formData.append('userId', window.userId);

  // RAG용 지식 파일 전송
  document.querySelectorAll("#knowledge-list input[type=checkbox]:checked").forEach((cb, i) => {
    const idx = cb.getAttribute('data-idx');
    const content = window._knowledge[idx].content;
    formData.append('knowledgeFiles', new Blob([content], { type: 'text/plain' }), `knowledge_${i}.txt`);
  });

  // 참조 파일 첨부: 누적된 uploadedFiles 배열 사용
  uploadedFiles.forEach(file => {
    formData.append('references', file);
  });

  try {
    const res = await fetch("/askWithRef", { method: "POST", body: formData });
    const json = await res.json();
    responseBox.textContent = json.answer || `오류: ${json.error || '알 수 없음'}`;
  } catch (err) {
    console.error("Fetch Error:", err);
    responseBox.textContent = "서버 통신에 실패했습니다.";
  }
}

sendBtn.onclick = sendMessage;
