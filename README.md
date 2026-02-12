# 🚀 AutoFiller

AutoFiller is a smart Chrome Extension + Backend system that automatically fills online forms using a structured user profile and intelligent field matching.

It reduces repetitive form filling by learning mappings over time and adapting to different form structures.

---

## 🧠 Problem It Solves

Filling forms repeatedly (internships, college forms, surveys, applications) is:

- Time-consuming  
- Repetitive  
- Error-prone  

AutoFiller solves this by:

- Storing your profile data once
- Automatically detecting form fields
- Intelligently matching them
- Learning new mappings over time

---

## 🏗️ Architecture

AutoFiller consists of three main layers:

### 🔹 Chrome Extension (Frontend Layer)
- Scans Google Forms
- Extracts labels + input fields
- Sends labels to backend
- Autofills matched values
- Learns unknown fields interactively

### 🔹 Node.js + Express Backend (Logic Layer)
- JWT Authentication
- Profile management
- Field mapping storage
- Intelligent matching engine
- Explicit mapping priority system

### 🔹 MongoDB (Data Layer)
- User profiles stored as dynamic key-value maps
- Persistent form-label → profile-key mappings

---

## ⚙️ Tech Stack

- Frontend: Chrome Extension (Vanilla JavaScript)
- Backend: Node.js, Express
- Database: MongoDB (Mongoose)
- Authentication: JWT
- Architecture: Modular MVC pattern

---

## 🔄 How Matching Works

Matching follows a priority system:

### 1️⃣ Explicit Mapping (Highest Priority)

If user has previously mapped:

"Full Name *" → "full_name"

AutoFiller directly fills using stored mapping.

---

### 2️⃣ Intelligent Fallback Matching

If no explicit mapping exists:

- Normalizes label (removes `*`, `:`, extra spaces)
- Matches against profile keys using keyword logic

Example:
- "Email Address" → "email"
- "Full Name" → "full_name"

---

### 3️⃣ Learning Mode

If no match is found:

- User is prompted to map the field
- Mapping is stored in database
- Future forms autofill automatically

AutoFiller improves with usage.

---

## 🔐 Authentication Flow

- User logs in via extension popup
- JWT token stored in chrome.storage
- All backend requests are authenticated
- Protected routes enforce user isolation

---

## 📂 Project Structure

```
AutoFiller/
│
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   └── server.js
│
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   └── content.js
│
└── README.md
```

---

## 🚀 Setup Instructions

### 1️⃣ Backend Setup

```
cd backend
npm install
```

Create a `.env` file:

```
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

Run server:

```
npm run dev
```

---

### 2️⃣ Extension Setup

1. Open Chrome  
2. Go to: chrome://extensions  
3. Enable Developer Mode  
4. Click “Load unpacked”  
5. Select the `extension` folder  

---

## 📈 Future Improvements

- Support for more form types (non-Google forms)
- Smarter AI-based semantic matching
- UI dashboard for profile management
- Mapping analytics
- One-click autofill
- SaaS version with cloud sync

---

## 💡 Vision

AutoFiller is not just a Chrome extension.

It is a foundation for a smart personal data engine that:

- Understands structured user identity
- Adapts to dynamic form schemas
- Learns continuously

Long-term vision: Become the universal form automation layer for the web.

---

## 👨‍💻 Author

Abhijeet Patil  
Computer Science Student  
Building real systems, not just assignments.
