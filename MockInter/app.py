import streamlit as st
import openai
import time
import os
import json
import re
import google.generativeai as genai
import numpy as np
import speech_recognition as sr
import cv2
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv
from google.api_core.exceptions import GoogleAPIError, NotFound
from streamlit_webrtc import webrtc_streamer, VideoTransformerBase, RTCConfiguration
from PIL import Image as PILImage
import streamlit.components.v1 as components

# ---------------------------
# Environment and API Configuration
# ---------------------------
load_dotenv()
GEMINI_API_KEY = os.getenv("API_KEY") or os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# ---------------------------
# MongoDB Connection (for interview feedback and face logs)
# ---------------------------
client = MongoClient("mongodb://localhost:27017/")
db = client["mock_interviews"]
feedback_collection = db["feedbacks"]

def technical_is_unlocked(student_id):
    """Enforce the server-maintained DSA qualification before an interview starts."""
    try:
        client = MongoClient("mongodb://localhost:27017/", serverSelectionTimeoutMS=2000)
        student_db = client["studentDB"]
        progress = student_db["placementprogresses"].find_one(
            {"studentId": student_id},
            {"aptitude.status": 1, "dsa.status": 1, "dsa.submitted": 1}
        )
        dsa = (progress or {}).get("dsa", {})
        aptitude = (progress or {}).get("aptitude", {})
        if (
            aptitude.get("status") == "QUALIFIED"
            and dsa.get("status") == "QUALIFIED"
            and dsa.get("submitted") is True
        ):
            return True
        config = student_db["assessmentconfigs"].find_one({"key": "default"}) or {"dsaMinScore": 60}
        if aptitude.get("status") != "QUALIFIED":
            latest_aptitude = client["quiz_system"]["apti_test"].find_one(
                {"student_id": student_id}, sort=[("timestamp", -1)]
            )
            minimum = float(config.get("aptitudeMinScore", 50))
            if latest_aptitude and int(latest_aptitude.get("no_of_questions", 0)) > 0:
                aptitude_qualified = (
                    float(latest_aptitude.get("marks_achieved", 0))
                    / float(latest_aptitude["no_of_questions"]) * 100
                ) >= minimum
                if aptitude_qualified:
                    student_db["placementprogresses"].update_one(
                        {"studentId": student_id},
                        {"$set": {"studentId": student_id, "aptitude.status": "QUALIFIED"}},
                        upsert=True
                    )
                    aptitude = {"status": "QUALIFIED"}
        submissions = list(client["DSA_code_app_db"]["submissions"].find({"username": student_id, "status": "accepted"}))
        qualifies = (
            aptitude.get("status") == "QUALIFIED"
            and dsa.get("submitted") is True
            and any(float(item.get("coding_score", item.get("score", 100))) >= float(config.get("dsaMinScore", 60)) for item in submissions)
        )
        if qualifies:
            student_db["placementprogresses"].update_one(
                {"studentId": student_id},
                {"$set": {"studentId": student_id, "dsa.status": "QUALIFIED", "technicalInterview.status": "AVAILABLE"}},
                upsert=True
            )
        return qualifies
    except Exception:
        return False


def technical_lock_message(student_id):
    """Return the first unmet placement requirement without starting interview resources."""
    try:
        student_db = client["studentDB"]
        progress = student_db["placementprogresses"].find_one(
            {"studentId": student_id},
            {"aptitude.status": 1, "dsa.status": 1, "dsa.submitted": 1}
        ) or {}
        aptitude = progress.get("aptitude", {})
        dsa = progress.get("dsa", {})
        if aptitude.get("status") != "QUALIFIED":
            return "Qualify in the Aptitude Round first before accessing the Technical Interview."
        if dsa.get("status") != "QUALIFIED":
            return "Complete and qualify the DSA Practice Round before accessing the Technical Interview."
        return "Complete and qualify the Aptitude and DSA rounds before accessing the Technical Interview."
    except Exception:
        return "Complete and qualify the Aptitude and DSA rounds before accessing the Technical Interview."


def store_face_log(student_id, message):
    """Log proctoring violations in the database."""
    collection = db["face_logs"]
    log_data = {
        "student_id": student_id,
        "timestamp": datetime.now(),
        "violation": message
    }
    try:
        collection.insert_one(log_data)
    except Exception as e:
        st.error(f"Error logging face violation: {e}")


# ---------------------------
# Helper function for rerunning the app
# ---------------------------
def rerun_app():
    if hasattr(st, 'rerun'):
        st.rerun()
    elif hasattr(st, 'experimental_rerun'):
        st.experimental_rerun()
    else:
        st.error("Rerun not supported in this version of Streamlit. Please upgrade Streamlit.")


# ---------------------------
# Video Transformer with Proctoring Enhancements
# (Handles No Face, Multiple Faces, and Improved Eye-Gaze Detection)
# ---------------------------
class VideoTransformer(VideoTransformerBase):
    def __init__(self):
        # Load Haar Cascades for face and eye detection.
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        self.eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")

        # Warning counters and timers.
        self.no_face_warning_count = 0
        self.multiple_face_warning_count = 0
        self.eye_gaze_warning_count = 0
        self.last_no_face_warning_time = time.time()
        self.last_multiple_warning_time = time.time()
        self.last_eye_gaze_warning_time = time.time()
        self.test_terminated = False

        # Smoothing parameters: count consecutive frames for face detections.
        self.no_face_frames = 0
        self.multiple_face_frames = 0
        self.frame_threshold = 5  # For face and multiple face detection

        # Timing thresholds.
        self.warning_interval = 2  # seconds between warnings.
        self.warning_limit = 10  # number of warnings before termination.

        # Control for proctoring activation.
        self.proctoring_enabled = False

        # Optional: student id to log violations.
        self.student_id = None

    def transform(self, frame):
        img = frame.to_ndarray(format="bgr24")

        # If proctoring is not enabled, simply return the frame.
        if not self.proctoring_enabled:
            return img

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        current_time = time.time()
        violation_message = None

        # ---------------------------
        # No Face Detection
        # ---------------------------
        faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
        if len(faces) == 0:
            self.no_face_frames += 1
            if self.no_face_frames >= self.frame_threshold:
                if current_time - self.last_no_face_warning_time > self.warning_interval:
                    self.no_face_warning_count += 1
                    self.last_no_face_warning_time = current_time
                    if self.student_id:
                        store_face_log(self.student_id, "No Face Detected!")
                violation_message = "No Face Detected!"
        else:
            self.no_face_frames = 0

        # ---------------------------
        # Multiple Faces Detection
        # ---------------------------
        if len(faces) > 1:
            self.multiple_face_frames += 1
            if self.multiple_face_frames >= self.frame_threshold:
                if current_time - self.last_multiple_warning_time > self.warning_interval:
                    self.multiple_face_warning_count += 1
                    self.last_multiple_warning_time = current_time
                    if self.student_id:
                        store_face_log(self.student_id, "Multiple Faces Detected!")
                violation_message = "Multiple Faces Detected!"
        else:
            self.multiple_face_frames = 0

        # Draw rectangles around detected faces.
        for (x, y, w, h) in faces:
            cv2.rectangle(img, (x, y), (x + w, y + h), (0, 255, 0), 2)

        # ---------------------------
        # Improved Eye-Gaze Detection (Ensure Eyes Look at Screen)
        # ---------------------------
        # Process only if exactly one face is detected.
        if len(faces) == 1:
            (fx, fy, fw, fh) = faces[0]
            face_roi_gray = gray[fy:fy + fh, fx:fx + fw]
            eyes = self.eye_cascade.detectMultiScale(face_roi_gray, scaleFactor=1.1, minNeighbors=5)
            # Draw rectangles around detected eyes.
            for (ex, ey, ew, eh) in eyes:
                cv2.rectangle(img, (fx + ex, fy + ey), (fx + ex + ew, fy + ey + eh), (255, 0, 0), 2)

            eye_violation = False
            # If fewer than two eyes are detected, treat as a violation.
            if len(eyes) < 2:
                eye_violation = True
            else:
                # Check each detected eye.
                for (ex, ey, ew, eh) in eyes:
                    eye_roi = face_roi_gray[ey:ey + eh, ex:ex + ew]
                    eye_roi = cv2.equalizeHist(eye_roi)
                    _, thresholded = cv2.threshold(eye_roi, 30, 255, cv2.THRESH_BINARY_INV)
                    contours, _ = cv2.findContours(thresholded, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
                    if contours:
                        max_contour = max(contours, key=cv2.contourArea)
                        M = cv2.moments(max_contour)
                        if M["m00"] != 0:
                            cx = int(M["m10"] / M["m00"])
                            # The pupil must be near the center of the eye.
                            # If it's too far left or right, flag as a violation.
                            if cx < ew / 4 or cx > 3 * ew / 4:
                                eye_violation = True
                    else:
                        eye_violation = True

            # Continuously show the warning if a violation is detected.
            if eye_violation:
                violation_message = "Not Looking at Screen!"
                if current_time - self.last_eye_gaze_warning_time > self.warning_interval:
                    self.eye_gaze_warning_count += 1
                    self.last_eye_gaze_warning_time = current_time
                    if self.student_id:
                        store_face_log(self.student_id, "Not Looking at Screen!")

        # ---------------------------
        # Persistent Overlay of Violation Message
        # ---------------------------
        if violation_message:
            overlay = img.copy()
            cv2.rectangle(overlay, (0, 0), (img.shape[1], img.shape[0]), (0, 0, 255), -1)
            alpha = 0.4
            cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = img.shape[1] / 800
            thickness = max(2, int(img.shape[1] / 400))
            text_size, _ = cv2.getTextSize(violation_message, font, font_scale, thickness)
            text_x = (img.shape[1] - text_size[0]) // 2
            text_y = (img.shape[0] + text_size[1]) // 2
            cv2.putText(img, violation_message, (text_x, text_y), font, font_scale, (255, 255, 255), thickness,
                        cv2.LINE_AA)

        # ---------------------------
        # Check if Warning Limits Exceeded (terminate interview if so)
        # ---------------------------
        if (self.no_face_warning_count >= self.warning_limit or
                self.multiple_face_warning_count >= self.warning_limit or
                self.eye_gaze_warning_count >= self.warning_limit):
            self.test_terminated = True

        return img


# ---------------------------
# RTC configuration for webrtc_streamer.
# ---------------------------
RTC_CONFIGURATION = RTCConfiguration({
    "iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]
})


# ---------------------------
# Interview Functions (Remaining parts unchanged)
# ---------------------------
@st.cache_resource(show_spinner=False)
def get_gemini_model(excluded_models=()):
    """Return a configured model that supports generateContent for this API key."""
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "Gemini API key is missing. Add API_KEY or GEMINI_API_KEY to MockInter/.env."
        )

    preferred_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    candidates = [
        preferred_model,
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash-latest",
    ]

    try:
        available_models = {
            model.name.removeprefix("models/"): model
            for model in genai.list_models()
            if "generateContent" in (model.supported_generation_methods or [])
        }
    except GoogleAPIError as exc:
        raise RuntimeError(f"Unable to list Gemini models: {exc}") from exc

    for candidate in candidates:
        model_name = candidate.removeprefix("models/")
        if model_name in available_models and model_name not in excluded_models:
            return genai.GenerativeModel(model_name)

    # Prefer any currently available Flash model when the configured names
    # have changed or are not enabled for this API key.
    flash_models = sorted(
        name for name in available_models
        if "flash" in name.lower() and name not in excluded_models
    )
    if flash_models:
        return genai.GenerativeModel(flash_models[0])

    available_names = ", ".join(sorted(available_models)) or "none"
    raise RuntimeError(
        f"No Gemini model available for generateContent. "
        f"Configured model: {preferred_model}. Available models: {available_names}"
    )


def generate_gemini_text(prompt):
    """Generate text and convert provider failures into actionable app errors."""
    # Model listings can contain retired aliases. Retry once after excluding
    # a model that the generateContent endpoint rejects.
    failed_models = set()
    for _ in range(3):
        try:
            model = get_gemini_model(tuple(sorted(failed_models)))
            response = model.generate_content(prompt)
            if not response.text:
                raise RuntimeError("Gemini returned an empty response.")
            return response.text
        except NotFound as exc:
            failed_models.add(model.model_name.removeprefix("models/"))
            get_gemini_model.clear()
            if len(failed_models) < 3:
                continue
            raise RuntimeError(f"Gemini request failed: {exc}") from exc
        except GoogleAPIError as exc:
            raise RuntimeError(f"Gemini request failed: {exc}") from exc

    raise RuntimeError("Gemini request failed: no usable model was available.")


def get_gemini_questions(job_role, tech_stack, experience):
    prompt = f"""
    Generate five interview questions for a {job_role} role requiring experience in {tech_stack}.
    The candidate has {experience} years of experience. Ensure the questions assess relevant skills and knowledge.
    Return exactly five questions, one per line. You may number them from 1 to 5.
    """
    questions = generate_gemini_text(prompt).splitlines()
    filtered_questions = []
    for question in questions:
        question = re.sub(r"^\s*(?:[-*•]\s+|\d+\s*[\].:)\-]\s*)", "", question).strip()
        question = re.sub(r"^(?:question\s*)?(?:\d+\s*[\].:)\-]\s*)", "", question,
                          flags=re.IGNORECASE).strip()
        if not question or question.lower().startswith(("here are", "questions:")):
            continue
        if "?" in question:
            question = question[:question.rfind("?") + 1].strip()
        elif len(filtered_questions) < 5:
            question = f"{question}?"
        else:
            continue
        filtered_questions.append(question)
        if len(filtered_questions) == 5:
            break
    if len(filtered_questions) < 5:
        raise RuntimeError("Gemini returned no usable interview questions. Please try again.")
    return filtered_questions


def process_answer(question, answer):
    prompt = f"""
    Evaluate the following candidate's answer to an interview question. 
    Provide a score out of 10 based on correctness, depth, and relevance, and give detailed feedback.

    Question: {question}
    Answer: {answer}
    """
    return generate_gemini_text(prompt)


def record_audio():
    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        st.write("Recording... Speak now!")
        audio = recognizer.listen(source, timeout=5)
    try:
        text = recognizer.recognize_google(audio)
        return text
    except sr.UnknownValueError:
        return "Could not understand audio"
    except sr.RequestError:
        return "Could not request results"


def speak_question(question):
    """Read the current interview question automatically in the browser."""
    # JSON encoding keeps punctuation and quotes safe inside the component script.
    safe_question = json.dumps(question)
    components.html(
        f"""
        <script>
            const question = {safe_question};
            const speakQuestion = () => {{
                if (!("speechSynthesis" in window)) return;
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(question);
                utterance.lang = "en-US";
                utterance.rate = 0.95;
                window.speechSynthesis.speak(utterance);
            }};
            // Voices may load after the component is rendered.
            window.speechSynthesis.onvoiceschanged = speakQuestion;
            [100, 500, 1000].forEach((delay) => setTimeout(speakQuestion, delay));
        </script>
        """,
        height=10,
    )


# ---------------------------
# Streamlit Session State Setup
# ---------------------------
if "interviews" not in st.session_state:
    st.session_state.interviews = []

# Camera and interview resources are deliberately created only after the
# backend-backed qualification check succeeds and the student starts a session.
camera = None
interview_access = False
active_username = None

if "current_interview" not in st.session_state:
    st.title("Technical Interview")
    username = st.text_input("Enter your username")
    active_username = username.strip()
    if active_username:
        interview_access = technical_is_unlocked(active_username)
        if not interview_access:
            st.error(f"Technical Interview is locked. {technical_lock_message(active_username)}")
            st.stop()
        st.success("Technical Interview unlocked.")
        job_role = st.text_input("Job Role/Job Position", placeholder="Ex. Full Stack Developer")
        tech_stack = st.text_input("Job Description/Tech Stack", placeholder="Ex. React, Angular, Node.js")
        experience = st.number_input("Years of Experience", min_value=0, step=1)
        start_btn = st.button("Start Technical Interview", disabled=not interview_access)
        if start_btn:
            if not active_username or not job_role or not tech_stack:
                st.error("Username, job role, and tech stack are required.")
            elif not technical_is_unlocked(active_username):
                st.error("Technical Interview is locked. Complete the required Aptitude and DSA qualifications first.")
            else:
                try:
                    questions = get_gemini_questions(job_role, tech_stack, experience)
                except RuntimeError as exc:
                    st.error(str(exc))
                else:
                    interview_data = {
                        "username": username,
                        "role": job_role,
                        "stack": tech_stack,
                        "experience": experience,
                        "questions": questions,
                        "responses": []
                    }
                    st.session_state.current_interview = interview_data
                    st.session_state.interviews.append(interview_data)
                    st.session_state.show_form = False
                    st.session_state.question_index = 0
                    rerun_app()

# ---------------------------
# Sidebar: Live Camera Feed (Proctoring)
# ---------------------------
if "current_interview" in st.session_state:
    active_username = st.session_state.current_interview["username"]
    interview_access = technical_is_unlocked(active_username)
    if not interview_access:
        st.error("Technical Interview is locked. Your qualification status must remain valid to continue.")
        del st.session_state["current_interview"]
        rerun_app()

    with st.sidebar:
        st.title("Live Camera Feed")
        camera = webrtc_streamer(
            key="camera",
            video_transformer_factory=VideoTransformer,
            rtc_configuration=RTC_CONFIGURATION,
            async_processing=True,
            media_stream_constraints={"video": True, "audio": False}
        )
        if camera and hasattr(camera, "video_transformer") and camera.video_transformer is not None:
            camera.video_transformer.proctoring_enabled = True
            camera.video_transformer.student_id = active_username
            st.markdown(f"**No Face Warnings:** {camera.video_transformer.no_face_warning_count}")
            st.markdown(f"**Multiple Face Warnings:** {camera.video_transformer.multiple_face_warning_count}")
            st.markdown(f"**Eye-Gaze Warnings:** {camera.video_transformer.eye_gaze_warning_count}")

# ---------------------------
# Interview Process (when interview is active)
# ---------------------------
if "current_interview" in st.session_state:
    if not (camera and hasattr(camera, "state") and getattr(camera.state, "playing", False)):
        st.warning("Please start your camera in the left sidebar before proceeding with the interview!")
    else:
        interview = st.session_state.current_interview
        st.subheader(f"Job Role: {interview['role']}")
        st.text(f"Tech Stack: {interview['stack']}")
        st.text(f"Years of Experience: {interview['experience']}")
        index = st.session_state.question_index
        if index < len(interview["questions"]):
            st.subheader(f"Question #{index + 1}")
            st.write(interview["questions"][index])
            speak_question(interview["questions"][index])
            answer_widget_key = f"answer_{index}"
            recorded_key = f"recorded_answer_{index}"
            # Initialize recorded answer key if not present.
            if recorded_key not in st.session_state:
                st.session_state[recorded_key] = ""
            # Use the recorded answer as the default value for the text area.
            answer = st.text_area("Your Answer", key=answer_widget_key,
                                  value=st.session_state.get(recorded_key, ""))
            col1, col2 = st.columns(2)
            with col1:
                if st.button("Record Answer", key=f"record_{index}"):
                    st.session_state[recorded_key] = record_audio()
                    rerun_app()
            with col2:
                if st.button("Next Question", key=f"next_{index}"):
                    answer = st.session_state.get(answer_widget_key, "")
                    try:
                        feedback = process_answer(interview["questions"][index], answer)
                    except RuntimeError as exc:
                        st.error(str(exc))
                    else:
                        response_data = {
                            "username": interview["username"],
                            "question": interview["questions"][index],
                            "answer": answer,
                            "feedback": feedback,
                            "timestamp": datetime.now()
                        }
                        feedback_collection.insert_one(response_data)
                        interview["responses"].append(response_data)
                        st.session_state.question_index += 1
                        rerun_app()
        else:
            # Disable proctoring once the final answer is submitted.
            if camera is not None and hasattr(camera, "video_transformer"):
                camera.video_transformer.proctoring_enabled = False

            feedback_collection.update_many(
                {"username": interview["username"], "completed": {"$ne": True}},
                {"$set": {"completed": True, "interview_id": f"{interview['username']}-{datetime.now().strftime('%Y%m%d%H%M%S')}"}}
            )
            st.success("Interview Completed!")
            st.markdown("## Interview Summary")
            for idx, response in enumerate(interview["responses"]):
                with st.expander(f"Question {idx + 1}: {response['question']}"):
                    st.markdown(f"**Your Answer:** {response['answer']}")
                    st.markdown(f"**Feedback:** {response['feedback']}")
            if st.button("Close Interview"):
                # Reset warning counters.
                if camera is not None and hasattr(camera, "video_transformer"):
                    camera.video_transformer.no_face_warning_count = 0
                    camera.video_transformer.multiple_face_warning_count = 0
                    camera.video_transformer.eye_gaze_warning_count = 0
                # Clear interview session state.
                del st.session_state["current_interview"]
                del st.session_state["question_index"]
                rerun_app()

# ---------------------------
# Previous Mock Interviews (when no active interview)
# ---------------------------
if "current_interview" not in st.session_state and st.session_state.interviews:
    st.subheader("Previous Mock Interviews")
    for i, interview in enumerate(st.session_state.interviews):
        with st.expander(
                f"{interview['role']} - {interview['experience']} Years (Created At: {datetime.now().strftime('%Y-%m-%d')})"
        ):
            st.write(f"Tech Stack: {interview['stack']}")
            for response in interview["responses"]:
                st.write(f"**Q:** {response['question']}")
                st.write(f"**Your Answer:** {response['answer']}")
                st.write(f"**Feedback:** {response['feedback']}")