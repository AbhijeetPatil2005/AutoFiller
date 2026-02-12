const statusDiv = document.getElementById('status');
const scanBtn = document.getElementById('scanBtn');

// Hide scan button by default
scanBtn.style.display = "none";

// Check if logged in on load
chrome.storage.local.get(['token'], (result) => {
    if (result.token) {
        statusDiv.innerText = "Logged in";
        scanBtn.style.display = "block";
    }
});

document.getElementById('loginBtn').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.token) {
            chrome.storage.local.set({ token: data.token }, () => {
                statusDiv.innerText = "Logged in successfully!";
                scanBtn.style.display = "block";
            });
        } else {
            statusDiv.innerText = "Login failed: " + (data.message || "Unknown error");
            statusDiv.style.color = "red";
        }
    })
    .catch(err => {
        statusDiv.innerText = "Error: " + err.message;
        statusDiv.style.color = "red";
    });
});

document.getElementById('scanBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { action: "scan" });
  }
});
