# 🎓 CareerConnect: AI-Powered Intelligent Campus Placement and Career Development Platform

CareerConnect is an **AI-powered campus placement and career development platform** designed to connect students, Training and Placement Officers (TPOs), and recruiters through a centralized placement-preparation ecosystem.

The platform combines **aptitude assessment, DSA coding, AI-proctored mock interviews, resume building, ATS analysis, performance analytics, and placement management** into a structured sequential workflow.

CareerConnect uses **Artificial Intelligence, Machine Learning, Computer Vision, Gemini AI, and data-driven analytics** to help students assess, improve, and track their placement readiness.

---

# 🚀 Key Features

## 👨‍🎓 Student Portal

* Student authentication
* Student profile management
* Aptitude assessment
* DSA coding assessment
* DSA practice
* Aptitude performance analytics
* DSA performance analytics
* AI-proctored mock interviews
* Resume Builder
* AI Resume ATS Scoring
* Placement announcements
* Placement readiness tracking
* Sequential qualification workflow

---

## 📊 Aptitude Assessment

The Aptitude module evaluates students across multiple areas:

* Logical reasoning
* Quantitative aptitude
* Verbal ability
* Analytical thinking
* Technical aptitude

### Key Features

* Timed examinations
* Automatic evaluation
* Instant score generation
* Topic-based questions
* AI-powered face detection
* Multiple-face detection
* Suspicious activity detection
* Attention monitoring
* Assessment history
* Performance analysis
* Qualification tracking

---

# 🔐 Aptitude Qualification

The first round of CareerConnect is the Aptitude Assessment.

| Requirement              |        Value |
| ------------------------ | -----------: |
| Maximum Score            | **30 Marks** |
| Minimum Qualification    | **15 Marks** |
| Qualification Percentage |      **50%** |

```text
Score < 15/30
      ↓
❌ Not Qualified
      ↓
DSA Remains Locked
```

```text
Score >= 15/30
      ↓
✅ Qualified
      ↓
DSA Unlocked
```

The aptitude score and qualification status are stored in the backend/database.

The backend qualification state is treated as the authoritative source for unlocking the next round.

---

# ⚡ Quick Aptitude Test

CareerConnect can also support a shorter Quick Aptitude Test.

| Requirement              |        Value |
| ------------------------ | -----------: |
| Maximum Score            | **10 Marks** |
| Minimum Qualification    |  **5 Marks** |
| Qualification Percentage |      **50%** |

```text
Quick Test: 5/10
      ↓
Equivalent Standard Qualification
      ↓
✅ Qualified
```

```text
Quick Test: <5/10
      ↓
❌ Not Qualified
```

---

# 📈 Aptitude Analysis Dashboard

The Aptitude Dashboard provides detailed performance insights.

### Features

* Topic-wise performance
* Accuracy analysis
* Score tracking
* Time management analysis
* Strength identification
* Weakness identification
* Performance graphs
* Assessment history
* Preparation recommendations

---

# 💻 DSA Coding Assessment

The DSA module provides a coding environment designed to simulate technical placement coding rounds.

### Features

* Online code editor
* Syntax highlighting
* Multiple programming languages
* Code execution
* Automated test cases
* Topic-based coding problems
* Coding attempt tracking
* Problem-solving analysis
* Coding performance dashboard
* Progress tracking

---

# 🔒 Sequential DSA Access Control

DSA is protected by the Aptitude qualification gate.

Students must first qualify in Aptitude.

```text
ROUND 1
APTITUDE
   ↓
Score >= 15/30
   ↓
✅ Qualified
   ↓
DSA UNLOCKED
```

If Aptitude is not qualified:

```text
APTITUDE NOT QUALIFIED
   ↓
❌ DSA LOCKED
```

The DSA module can remain visible in the Student Portal, allowing students to understand the next stage without allowing them to access protected functionality.

### Protected DSA Components

* DSA Test
* DSA Practice
* DSA Dashboard
* Protected DSA APIs
* Direct DSA URLs

Example:

```text
DSA Practice Platform

Enter your username

DSA Practice is locked.

Qualify in the Aptitude Round first.
```

---

# 🛡️ DSA Backend Security

DSA access is not controlled only through frontend visibility.

The backend verifies the student's qualification state before providing access.

The system is designed to prevent bypass attempts through:

* Direct URL access
* Browser refresh
* Frontend state manipulation
* LocalStorage manipulation
* SessionStorage manipulation
* URL parameter manipulation
* Direct protected API requests

The database/backend qualification state is treated as the authoritative source.

---

# ⏱️ DSA Minimum Duration Qualification

Students must satisfy the minimum DSA assessment duration before becoming eligible for the AI Mock Interview.

### Minimum Required Duration

**30 Minutes**

```text
DSA Duration < 30 Minutes
        ↓
❌ Interview Not Eligible
```

```text
DSA Duration >= 30 Minutes
        ↓
✅ Interview Eligible
```

| DSA Duration  | Result         |
| ------------- | -------------- |
| 5 minutes     | ❌ Not Eligible |
| 10 minutes    | ❌ Not Eligible |
| 20 minutes    | ❌ Not Eligible |
| 29:59 minutes | ❌ Not Eligible |
| 30:00 minutes | ✅ Eligible     |
| 31+ minutes   | ✅ Eligible     |

---

# 🔐 Server-Side DSA Timing

The DSA duration requirement is validated using server-side timestamps.

The backend tracks:

* DSA start time
* DSA completion time
* Elapsed duration
* Completion status
* Qualification status
* Interview eligibility

This prevents students from bypassing the duration requirement through:

* Browser timer manipulation
* LocalStorage
* SessionStorage
* Frontend state manipulation
* URL parameters
* Modified request payloads

Refreshing the browser does not reset the server-side timing information.

---

# 📉 DSA Performance Dashboard

The DSA Dashboard provides coding-performance insights.

### Features

* Coding score analysis
* Progress tracking
* Topic-wise statistics
* Problem-solving accuracy
* Execution-time comparison
* Test-case performance
* Coding attempt history
* Technical skill improvement insights

---

# 🎙️ AI-Proctored Mock Interview

The AI Mock Interview represents **Round 3** of the CareerConnect sequential workflow.

The system uses AI and computer vision to simulate an interview environment.

### Features

* AI interviewer
* Gemini AI integration
* Voice-based interaction
* Speech recognition
* Dynamic follow-up questions
* Webcam monitoring
* Face tracking
* Attention monitoring
* Facial analysis
* Interview performance analysis
* Automated feedback generation

---

# 🔐 Interview Qualification

The AI Mock Interview remains visible in the Student Portal but is locked until all previous requirements are satisfied.

Students must:

1. Qualify Aptitude with **15/30 or higher**
2. Access the DSA round
3. Complete the DSA assessment
4. Spend at least **30 minutes** in DSA
5. Satisfy the existing DSA qualification requirements

```text
Aptitude Qualified
       +
DSA Completed
       +
DSA Duration >= 30 Minutes
       +
DSA Qualified
       ↓
Interview Unlocked
```

Example locked state:

```text
AI Mock Interview

Interview is locked.

Complete the Aptitude and DSA
qualification requirements before starting.
```

---

# 🛡️ Interview Backend Protection

The backend verifies interview eligibility before allowing access.

The system is designed to prevent bypass attempts through:

* Direct interview URLs
* Frontend manipulation
* LocalStorage
* SessionStorage
* Browser refresh
* URL parameters
* Direct API requests
* Starting the interview before completing DSA

Frontend visibility is used for user experience, while backend authorization provides the actual security boundary.

---

# 🔄 Complete Sequential Placement Workflow

```text
                    STUDENT LOGIN
                         ↓
                 STUDENT DASHBOARD
                         ↓
                ┌─────────────────┐
                │     ROUND 1     │
                │  APTITUDE TEST  │
                │   Max: 30       │
                │   Pass: 15      │
                └────────┬────────┘
                         ↓
                  Score >= 15/30?
                    /          \
                  NO            YES
                  ↓              ↓
             DSA LOCKED     DSA UNLOCKED
                                 ↓
                ┌────────────────────────┐
                │        ROUND 2         │
                │      DSA ASSESSMENT    │
                └───────────┬────────────┘
                            ↓
                     DSA Completed?
                            ↓
                    Duration >= 30 min?
                            ↓
                     DSA Qualification
                            ↓
                ┌────────────────────────┐
                │        ROUND 3         │
                │    AI MOCK INTERVIEW   │
                └────────────────────────┘
                            ↓
                     AI Feedback Report
```

---

# 🏆 Round-Based Architecture

## Round 1 — Aptitude

```text
Maximum Score: 30
Minimum Score: 15
Qualification: 50%
```

Aptitude qualification is required before DSA access.

## Round 2 — DSA

```text
Aptitude Qualified
       ↓
DSA Access
       ↓
DSA Completion
       ↓
Minimum 30-Minute Duration
       ↓
DSA Qualification
```

## Round 3 — AI Mock Interview

```text
Aptitude Qualified
       +
DSA Completed
       +
30-Minute Minimum Duration
       +
DSA Qualified
       ↓
AI Mock Interview
```

---

# 📄 Resume Builder

CareerConnect provides a professional Resume Builder.

### Features

* Professional resume templates
* Personal information
* Education
* Certifications
* Projects
* Experience
* Technical skills
* Achievements
* PDF generation
* Resume editing

---

# 🤖 Resume ATS Scoring

The Resume ATS module analyzes resumes according to Applicant Tracking System principles.

### Features

* AI-powered resume analysis
* ATS compatibility score
* Keyword matching
* Missing skill identification
* Resume improvement suggestions
* Job-description analysis
* Formatting evaluation
* Resume quality analysis

---

# 📢 Placement Announcements

The Announcements module provides centralized communication between TPOs, companies, and students.

### Features

* Placement announcements
* Company recruitment updates
* Interview schedules
* Assessment schedules
* Placement notifications
* Important document sharing
* Student-specific updates

---

# 🙍 Student Profile

The Student Profile provides a centralized view of academic and placement information.

### Features

* Personal information
* Academic information
* Certifications
* Achievements
* Technical skills
* Aptitude performance
* DSA performance
* Interview history
* Placement readiness
* Qualification status

---

# 🧑‍🏫 TPO & Company Dashboard

CareerConnect provides dedicated functionality for Training and Placement Officers and recruiters.

### Features

* Student readiness monitoring
* Job posting
* Internship posting
* Placement announcements
* Student performance analytics
* Assessment qualification tracking
* Sequential round monitoring
* Performance reports
* Report export

---

# 🧠 Technology Stack

## Frontend

* HTML5
* CSS3
* JavaScript
* Streamlit
* Interactive dashboards

## Backend

* Node.js
* Express.js
* Python

## Database

* MongoDB

## AI / ML

* Gemini AI
* OpenCV
* TensorFlow
* Scikit-learn
* Face Recognition libraries

## Computer Vision

* Face detection
* Face recognition
* Multiple-face detection
* Attention monitoring
* Visual behavior analysis

---

# 🤖 AI-Based Proctoring

CareerConnect uses AI-powered computer vision to improve assessment integrity.

### Monitoring Capabilities

* Face detection
* Face recognition
* Face absence detection
* Multiple-face detection
* Attention monitoring
* Head movement analysis
* Eye/gaze analysis
* Suspicious activity detection
* Event timestamp recording


# 📊 Proctoring Information

The system can maintain:

* Detection events
* Event timestamps
* Face information
* Suspicious activity information
* Assessment integrity indicators

---

# 📁 Project Structure

```text
CareerConnect-Smart-Campus-Placement-Portal/
│
├── index.html
├── student-login.html
├── studentdashboard.html
├── studentprofile.html
│
├── admin-login.html
├── admin-dashboard.html
├── adminprofile.html
├── admin-announce.html
│
├── company-login.html
├── company-dashboard.html
├── compannounce.html
│
├── interview.html
├── interview.js
├── interview.css
│
├── Aptitude/
│   ├── AptiApp.py
│   ├── InteractiveDashboard.py
│   ├── aptitude/
│   ├── logical-reasoning/
│   ├── verbal-ability/
│   ├── verbal-reasoning/
│   ├── data-interpretation/
│   ├── non-verbal-reasoning/
│   ├── c-programming/
│   ├── cpp-programming/
│   ├── c-sharp-programming/
│   ├── java-programming/
│   └── templates/
│
├── CodingPract/
│   ├── DSA_app_db.py
│   └── DSA_dash.py
│
├── MockInter/
│   └── app.py
│
├── ResumeATS/
│   └── app.py
│
├── Verbal_Q/
├── Templates/
│
├── css/
├── js/
│   └── vendor/
├── images/
├── fonts/
├── public/
├── upload/
├── logs/
│
├── server.js
├── effserver.js
├── package.json
├── package-lock.json
├── requirements.txt
├── .gitignore
├── LICENSE
└── README.md
```

# 🧩 Core Modules

| Directory / File   | Purpose                            |
| ------------------ | ---------------------------------- |
| `Aptitude/`        | Aptitude and technical assessments |
| `CodingPract/`     | DSA coding and practice            |
| `MockInter/`       | AI mock interview and proctoring   |
| `ResumeATS/`       | Resume Builder and ATS analysis    |
| `Verbal_Q/`        | Verbal question bank               |
| `Templates/`       | Resume/document templates          |
| `server.js`        | Main Express backend               |
| `css/`             | Global styling                     |
| `js/`              | JavaScript functionality           |
| `public/`          | Static/public resources            |
| `upload/`          | Uploaded files                     |
| `logs/`            | Application logs                   |
| `requirements.txt` | Python dependencies                |
| `package.json`     | Node.js configuration              |


# 🔐 Environment Configuration

AI-powered modules require a Gemini API key.

Configure the environment variables required by:

```text
MockInter\.env
ResumeATS\.env
```

Example:

```env
GEMINI_API_KEY=your_api_key_here
```

Replace the placeholder with your actual Gemini API key.

>

# 🌐 Application Routes

| Route                  | Module                |
| ---------------------- | --------------------- |
| `/`                    | CareerConnect Home    |
| `/aptitude/`           | Aptitude Assessment   |
| `/aptitude-dashboard/` | Aptitude Dashboard    |
| `/dsa/`                | DSA Coding Assessment |
| `/dsa-dashboard/`      | DSA Dashboard         |
| `/mockinterview/`      | AI Mock Interview     |
| `/resumeats/`          | Resume Builder / ATS  |

The exact routing depends on the Express and Streamlit integration configured in `server.js`.

---

# 🔄 Startup Order

Use the following order when running the complete platform:

```text
1. MongoDB
      ↓
2. Express Server
      ↓
3. Aptitude
      ↓
4. Aptitude Dashboard
      ↓
5. DSA
      ↓
6. DSA Dashboard
      ↓
7. AI Mock Interview
      ↓
8. Resume / ATS
      ↓
9. Open http://localhost:3000
```

Keep all required CMD windows running while using the platform.

---

# 🔐 Assessment Security Architecture

CareerConnect uses backend-controlled qualification states.

```text
Student Authentication
        ↓
Qualification Status
        ↓
Aptitude Qualification
        ↓
DSA Authorization
        ↓
DSA Completion
        ↓
Server-Side Duration
        ↓
DSA Qualification
        ↓
Interview Authorization
        ↓
AI Mock Interview
```

The frontend controls the user experience, while the backend controls authorization.

---

# 📊 Qualification State Tracking

The system tracks:

* Aptitude completion
* Aptitude score
* Aptitude qualification
* DSA access status
* DSA start time
* DSA completion time
* DSA elapsed duration
* DSA duration qualification
* DSA completion status
* DSA qualification
* Interview unlock status
* Interview eligibility

This allows CareerConnect to maintain a controlled sequential placement workflow.

---

# 🎯 Placement Readiness

CareerConnect combines multiple preparation areas:

```text
Aptitude
    +
DSA
    +
AI Interview
    +
Resume / ATS
    +
Performance Analytics
        ↓
Placement Readiness
```

The platform helps students:

* Identify skill gaps
* Improve aptitude performance
* Practice coding
* Prepare for interviews
* Improve resumes
* Track preparation progress
* Understand strengths and weaknesses
* Improve overall placement readiness

---

# 🔮 Future Enhancements

### 🌐 Multi-Language Support

* Regional language support
* Improved accessibility

### 🏆 Gamification

* Leaderboards
* Achievement badges
* Coding challenges
* Aptitude challenges
* Performance rankings

### 📅 Placement Drive Tracking

* Company updates
* Recruitment schedules
* Application status
* Interview schedules
* Selection progress

### 📊 Advanced TPO Analytics

* Student analytics
* Assessment analytics
* Placement statistics
* Interview analytics
* Downloadable reports

### 🔔 Notifications

* Email notifications for placement events
* Assessment reminders
* Interview reminders
* Placement alerts

### 📱 Mobile Enhancement

* Smartphone support
* Tablet support
* Responsive dashboards

### 🤖 AI Career Recommendations

* Job-role recommendations
* Skill-gap analysis
* Learning paths
* Certification suggestions
* Interview preparation plans
* Personalized improvement strategies

---

# 🎯 Project Objective

The primary objective of CareerConnect is to create a **centralized, intelligent, and secure campus placement preparation ecosystem** where students can continuously assess and improve their career readiness.

# 🌟 CareerConnect

**AI-Powered Intelligent Campus Placement and Career Development Platform**

```text
                    CAREERCONNECT
                          │
          ┌───────────────┼───────────────┐
          ↓               ↓               ↓
      APTITUDE           DSA         AI INTERVIEW
          │               │               │
          ↓               ↓               ↓
      ANALYSIS       PERFORMANCE       FEEDBACK
          │               │               │
          └───────────────┼───────────────┘
                          ↓
                     RESUME + ATS
                          ↓
                  PLACEMENT READINESS
                          ↓
                    CAREER SUCCESS

# 📜 License

This project is developed as an **academic and placement-preparation project**.

## 👨‍💻 CareerConnect

**Assess • Analyze • Improve • Practice • Qualify • Interview • Prepare**