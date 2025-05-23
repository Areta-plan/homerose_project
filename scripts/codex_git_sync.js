// codex_git_sync.js
const simpleGit = require('simple-git');
const path = require('path');

// 환경변수
const {
  GITHUB_TOKEN,
  GITHUB_REPO = 'your-id/your-repo.git',
  GITHUB_REMOTE = 'origin',
  GITHUB_BRANCH = 'main'
} = process.env;

if (!GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN이 설정되지 않았습니다.');
  process.exit(1);
}

const repoDir = path.resolve(__dirname);
const git = simpleGit(repoDir);
const remoteUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}`;

(async () => {
  try {
    // 1) 원격 재설정 (한 번만)
    const remotes = await git.getRemotes();
    if (!remotes.find(r => r.name === GITHUB_REMOTE)) {
      await git.addRemote(GITHUB_REMOTE, remoteUrl);
    } else {
      await git.remote(['set-url', GITHUB_REMOTE, remoteUrl]);
    }

    // 2) add & commit
    await git.add('.');
    const commitMsg = `🔄 chore: codex auto-sync @ ${new Date().toISOString()}`;
    await git.commit(commitMsg);

    // 3) pull(rebase) & push
    await git.pull(GITHUB_REMOTE, GITHUB_BRANCH, { '--rebase': 'true' });
    await git.push(GITHUB_REMOTE, GITHUB_BRANCH);

    console.log('✅ simple-git으로 Codex → GitHub 동기화 완료');
  } catch (e) {
    console.error('❌ simple-git 동기화 오류:', e);
    process.exit(1);
  }
})();
