const statusDiv = document.getElementById('status');
const scanBtn = document.getElementById('scanBtn');
const profileSection = document.getElementById('profile-section');
const profileSelect = document.getElementById('profileSelect');

let token = null;
let profileData = {};

// Load profiles
async function loadProfiles() {
    try {
        const res = await fetch('http://localhost:5000/api/profiles', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) throw new Error('Failed to load profiles');

        const profiles = await res.json();
        
        profileSelect.innerHTML = "<option value='' disabled>Select Profile</option>";

        profiles.forEach(profile => {
            const option = document.createElement("option");
            option.value = profile._id;
            option.text = profile.profile_name;
            if (profile.isActive) option.selected = true;
            profileSelect.appendChild(option);
        });
    } catch (e) {
        console.error("Error loading profiles", e);
        statusDiv.innerText = "Error loading profiles";
        statusDiv.style.color = "red";
    }
}

// Handle profile change
profileSelect.addEventListener('change', async () => {
    const profileId = profileSelect.value;
    
    if (!profileId) return;

    try {
        const res = await fetch(
            `http://localhost:5000/api/profiles/${profileId}/activate`,
            {
                method: "PUT",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        if (res.ok) {
            statusDiv.innerText = "Profile switched";
            statusDiv.style.color = "green";

            // Trigger auto-scan
            console.log("AutoFiller: Auto-scanning after profile activation");
            
            const [tab] = await chrome.tabs.query({ 
                active: true, 
                currentWindow: true 
            });

            if (tab) {
                chrome.tabs.sendMessage(tab.id, { action: "scan" });
            }
        } else {
            statusDiv.innerText = "Activation failed";
            statusDiv.style.color = "red";
        }
    } catch (e) {
        console.error("Error activating profile", e);
        statusDiv.innerText = "Error activating profile";
        statusDiv.style.color = "red";
    }
});

// Add Field Logic
document.getElementById('addFieldBtn').addEventListener('click', () => {
    const key = document.getElementById('fieldKey').value.trim();
    const value = document.getElementById('fieldValue').value.trim();

    if (!key || !value) {
        statusDiv.innerText = "Please enter key and value";
        statusDiv.style.color = "red";
        return;
    }

    profileData[key] = value;

    document.getElementById('fieldsPreview').innerText = JSON.stringify(profileData, null, 2);

    document.getElementById('fieldKey').value = "";
    document.getElementById('fieldValue').value = "";

    statusDiv.innerText = `Added field: ${key}`;
    statusDiv.style.color = "green";
});

// Create Profile Logic
document.getElementById('createProfileBtn').addEventListener('click', async () => {
    const profileName = document.getElementById('profileName').value.trim();

    if (!profileName) {
        statusDiv.innerText = "Enter profile name";
        statusDiv.style.color = "red";
        return;
    }

    if (Object.keys(profileData).length === 0) {
        statusDiv.innerText = "Add at least one field";
        statusDiv.style.color = "red";
        return;
    }

    try {
        const res = await fetch('http://localhost:5000/api/profiles', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                profile_name: profileName,
                data: profileData
            })
        });

        if (res.ok) {
            statusDiv.innerText = "Profile created successfully";
            statusDiv.style.color = "green";
            profileData = {};
            document.getElementById('fieldsPreview').innerText = "";
            document.getElementById('profileName').value = "";
            loadProfiles();
        } else {
            statusDiv.innerText = "Error creating profile";
            statusDiv.style.color = "red";
        }
    } catch (e) {
        console.error("Error creating profile", e);
        statusDiv.innerText = "Error creating profile";
        statusDiv.style.color = "red";
    }
});

// Login
document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch(
            'http://localhost:5000/api/auth/login',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            }
        );

        const data = await res.json();

        if (data.token) {
            chrome.storage.local.set({ token: data.token });
            token = data.token;
            statusDiv.innerText = "Logged in ✅";
            statusDiv.style.color = "green";
            
            profileSection.style.display = "block";
            scanBtn.style.display = "block";
            document.getElementById('login-section').style.display = 'none';

            loadProfiles();
        } else {
            statusDiv.innerText = "Login failed";
            statusDiv.style.color = "red";
        }
    } catch (e) {
        console.error("Login error", e);
        statusDiv.innerText = "Login error";
        statusDiv.style.color = "red";
    }
});

// Scan button
scanBtn.addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query(
            { active: true, currentWindow: true }
        );
        chrome.tabs.sendMessage(tab.id, { action: "scan" });
    } catch (e) {
        console.error("Scan error", e);
    }
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
    chrome.storage.local.clear(() => {
        location.reload();
    });
});

// Check login on load
chrome.storage.local.get(['token'], async (result) => {
    if (result.token) {
        token = result.token;
        
        // Hide login, show app
        document.getElementById('login-section').style.display = 'none';
        profileSection.style.display = 'block';
        scanBtn.style.display = 'block';
        document.getElementById('logoutBtn').style.display = 'block';

        // Load profiles
        loadProfiles();

        // Fetch user info for status
        try {
            const res = await fetch('http://localhost:5000/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const user = await res.json();
                statusDiv.innerText = `Logged in as: ${user.email}`;
                statusDiv.style.color = "green";
            }
        } catch (e) {
            console.error("Error fetching user info", e);
        }
    }
});

// Logout Logic
document.getElementById('logoutBtn').addEventListener('click', () => {
    chrome.storage.local.remove('token', () => {
        token = null;
        document.getElementById('login-section').style.display = 'block';
        profileSection.style.display = 'none';
        scanBtn.style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
        statusDiv.innerText = "Logged out";
        statusDiv.style.color = "grey";
    });
});
