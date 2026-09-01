<<<<<<< HEAD
# 🎓 CareerConnect: An AI-Powered Intelligent Campus Placement and Career Development Platform

CareerConnect is an intelligent AI-powered campus placement management platform designed to bridge the gap between students, training and placement officers, and recruiters. It provides a centralized ecosystem for skill assessment, interview preparation, resume enhancement, and placement tracking. The platform leverages Artificial Intelligence and data-driven analytics to evaluate student performance,

It features advanced modules for resume building, aptitude & technical tests, AI-proctored interviews, and performance analytics to help students improve their career readiness. Resume building helps students create professional industry-standard resumes, aptitude and technical tests evaluate their skills and identify knowledge gaps, AI-proctored interviews provide realistic interview practice with automated feedback, and performance analytics track progress to guide continuous improvement and enhance placement success.

⚠️ Note: The repository structure is organized into multiple independent components. Following the setup and execution steps provided below in the specified order will ensure the successful deployment and smooth execution of the complete project.


---

## 🚀 Features

### 👨‍🎓 Student Portal

- **📊 Aptitude Test**  
 A comprehensive online aptitude assessment platform designed to evaluate students' logical reasoning, quantitative ability, verbal ability, and analytical thinking skills. The system provides time-based tests, automatic evaluation, instant score generation, and AI-based face recognition proctoring to ensure a secure and fair examination environment.

Key Features:

⏱️ Timed aptitude examinations
🧠 Logical reasoning, quantitative, and verbal ability questions
🤖 AI-powered face detection and monitoring
📸 Suspicious activity detection during tests
✅ Automatic answer evaluation
📊 Instant result generation

- **📈 Aptitude Analysis Dashboard**  
An interactive performance analytics dashboard that helps students understand their aptitude preparation level through detailed insights and visual reports.

Key Features:

📌 Topic-wise performance analysis
📊 Accuracy and score tracking
⏳ Time management analysis
💪 Strength and weakness identification
📈 Performance improvement graphs
🎯 Personalized preparation recommendations

- **💻 DSA Coding Test**  
A real-time coding assessment environment that evaluates students' programming skills and problem-solving abilities similar to technical placement coding rounds.

Key Features:

👨‍💻 Online code editor with syntax highlighting
📝 Multiple programming language support
⚡ Real-time code execution
🧪 Automated test case evaluation
📚 Topic-based coding questions
🔍 Time and memory complexity analysis
🗂️ Coding attempt history tracking

- **📉 DSA Performance Dashboard**  
A detailed coding performance monitoring system that helps students track their progress and improve technical skills.

Key Features:

📊 Coding score analysis
📈 Progress tracking over multiple attempts
🧩 Topic-wise coding statistics
✅ Problem-solving accuracy analysis
⏱️ Execution time comparison
🏆 Coding skill improvement insights

- **🎙️ AI-Proctored Mock Interviews**  
An advanced AI-powered interview simulation platform that provides real-time technical and HR interview experiences similar to actual placement interviews.

Key Features:

🎥 Live webcam-based interview sessions
🤖 AI interviewer using Gemini AI
🎤 Voice-based conversation support
🗣️ Real-time speech recognition
🔄 Dynamic follow-up question generation
👁️ Attention and face tracking
😊 Expression and confidence analysis
📑 Automated interview feedback report

- **🧾 Resume Builder**  
A professional resume creation tool that enables students to build industry-ready resumes using predefined templates and structured sections.

Key Features:

📄 Multiple professional resume templates
✍️ Personal information management
🎓 Education and certification sections
💼 Project and experience management
🛠️ Technical skills customization
📥 PDF resume download
🔄 Resume editing and updating

- **📄 Resume ATS Scoring**  
An AI-based resume evaluation system that analyzes resumes based on Applicant Tracking System (ATS) standards used by companies during recruitment.

Key Features:

🤖 AI-powered resume analysis
📊 ATS compatibility score generation
🔑 Keyword matching with job descriptions
📝 Missing skill identification
💡 Resume improvement suggestions
📈 Industry-standard formatting evaluation

- **📢 Announcements**  
A centralized communication platform where students can receive important placement-related updates and notifications from Training and Placement Officers (TPOs).

Key Features:

📌 Placement announcements
🏢 Company recruitment updates
📅 Interview and test schedules
🔔 Real-time notifications
📂 Important document sharing
🎯 Personalized student updates

- **🙍 Student Profile**  
A personalized student dashboard that stores academic information, skills, achievements, and complete placement preparation history.

Key Features:

👤 Personal and academic information management
🎓 Education details
🏆 Certifications and achievements
💻 Technical skills management
📊 Complete performance overview
📈 Aptitude, DSA, and interview history
🎯 Personalized placement readiness score

---

### 🧑‍🏫 TPO & Company Dashboard

- 📊 Monitor student readiness with analytics  
- 📋 Post jobs, internships, or announcements  
- 📈 Export reports on aptitude, coding, and interview performance

---

## 🧠 Tech Stack

### **Technology Stack**

**Frontend Layer:**
HTML5, CSS3, and Streamlit are used for developing an interactive, user-friendly web interface with real-time dashboards and seamless user interaction.

**Backend Layer:**
Node.js and Python are used for implementing server-side logic, API development, application processing, and integration of AI-powered functionalities.

**AI/ML Layer:**
OpenCV, TensorFlow, Scikit-learn, and Face Recognition Libraries are used for computer vision processing, facial analysis, machine learning model development, predictive analytics, and intelligent assessment features.

**Database Layer:**
MongoDB is used for secure storage and efficient management of student profiles, assessment records, interview reports, performance analytics, and placement-related application data.


---

## 🛡️ AI Face Recognition Proctoring
An intelligent AI-powered monitoring system designed to ensure secure and fair online assessments by continuously analyzing candidate behavior through real-time computer vision techniques. The system uses facial recognition, attention tracking, and behavioral analysis to detect suspicious activities during aptitude tests and AI-based mock interviews.

Key Features:
🎥 Real-Time Face Detection & Recognition
Continuously monitors the candidate through webcam-based facial recognition to verify identity and maintain assessment integrity.

👁️ AI-Based Attention & Gaze Tracking
Analyzes head movement, eye direction, and user focus to detect instances of distraction or looking away from the screen.

👥 Multiple Face Detection & Unauthorized Presence Alerts
Identifies additional faces appearing in the camera frame and generates alerts to prevent unfair practices during assessments.

😊 Facial Expression & Emotion Analysis
Evaluates facial expressions and behavioral patterns during AI mock interviews to measure confidence, engagement, and communication response.

🚨 Suspicious Activity Monitoring
Detects abnormal activities such as face absence, frequent movements, and unusual behavior patterns using AI-based vision models.

📊 Proctoring Report Generation
Generates detailed monitoring reports containing violations, timestamps, confidence scores, and assessment integrity analysis.

🔐 Secure AI-Based Assessment Environment
Provides automated remote invigilation capabilities without requiring manual supervision, ensuring reliable and scalable online evaluations.

## 🛠️ How to Run Locally

### Prerequisites

Before running the project, make sure the following are installed and set up on your system:

- ✅ MongoDB installed and running  
  → [Download MongoDB](https://www.mongodb.com/try/download/community)

- ✅ Node.js installed  
  → [Download Node.js](https://nodejs.org/en/download/)

---

## 🔐 API Configuration

To enable AI-powered features such as interview feedback and resume scoring using Gemini AI, you'll need to set up your Gemini API Key.

1. Get your Gemini API Key:
   - Visit: https://aistudio.google.com/app/apikey
   - Sign in with your Google account and generate a new API key.

2. Add the API key to the respective .env files:

📁 MockInter/.env
📁 ResumeATS/.env

GEMINI_API_KEY=your_api_key_here

⚠️ Make sure to replace your_api_key_here with your actual API key. Do not share this key publicly.

3. Restart the modules (MockInterview & ResumeATS) after setting the environment variables.

---

### Steps

2. ** Move To the Folder
cd CareerConnect-Smart-Campus-Placement-Portal-main


2. ** Start the Node.js server**

```bash
node server.js
```

3. **Run each Streamlit module in a new terminal:**

```bash
# Aptitude Test
cd CareerConnect-Smart-Campus-Placement-Portal-main
cd Aptitude
streamlit run AptiApp.py --server.port 8501

# Aptitude Dashboard

cd CareerConnect-Smart-Campus-Placement-Portal-main
cd Aptitude
streamlit run InteractiveDashboard.py --server.port 8502

# DSA Test
cd CareerConnect-Smart-Campus-Placement-Portal-main
cd CodingPract
streamlit run DSA_app_db.py --server.port 8503

# DSA Dashboard
cd CareerConnect-Smart-Campus-Placement-Portal-main
cd CodingPract
streamlit run DSA_dash.py --server.port 8504

# Mock Interview
cd CareerConnect-Smart-Campus-Placement-Portal-main
cd MockInter
streamlit run app.py --server.port 8505

# Resume Builder & ATS
cd CareerConnect-Smart-Campus-Placement-Portal-main
cd ResumeATS
streamlit run app.py --server.port 8506
```

4. **Launch the frontend**

Open `index.html` in a browser.
---

## 📈 Future Enhancements

## 🚀 Future Enhancements

* **🌐 Multi-Language Support**
  Extend the platform with regional language capabilities to improve accessibility and provide a personalized experience for students from diverse backgrounds.

* **🏆 Gamified Assessment System**
  Introduce gamification features such as leaderboards, achievement badges, performance rankings, and challenges to encourage student engagement and continuous learning.

* **📅 Real-Time Placement Drive Tracking**
  Implement live placement drive monitoring with company updates, recruitment schedules, application status, and selection progress tracking.

* **📊 Advanced Admin Dashboard & Reporting**
  Develop a comprehensive administrative dashboard with data visualization, student performance insights, placement analytics, and downloadable reports for TPOs and administrators.

* **🔔 SMS & Email Notification Integration**
  Enable automated communication through SMS and email alerts for placement announcements, assessment schedules, interview updates, and important notifications.

* **📱 Mobile-Responsive Platform Enhancement**
  Optimize the application for mobile devices to provide seamless access across smartphones, tablets, and different screen sizes.

* **🤖 Advanced AI Career Recommendations** *(Additional Enhancement)*
  Integrate AI-driven career guidance to provide personalized learning paths, skill recommendations, and job role suggestions based on student performance and industry requirements.
  
=======
# Campus-Placement-Portol-main
>>>>>>> 4d4088e908b21ff6a868d0e9f8b35f6f65d3d9a9
