import streamlit as st
import random
import os
import base64
from openpyxl import load_workbook
from PIL import Image as PILImage
from typing import Any, cast
import io
import time  
import pymongo
from pymongo import MongoClient
from datetime import datetime
import cv2  # For face and eye detection


from streamlit_webrtc import webrtc_streamer, VideoTransformerBase, RTCConfiguration


def get_opencv_haarcascade(filename: str) -> str:
    cv2_data = getattr(cv2, "data", None)
    haarcascade_root = getattr(cv2_data, "haarcascades", os.path.join(os.path.dirname(cv2.__file__), "data", "haarcascades"))
    return os.path.join(haarcascade_root, filename)


session_defaults = {
    "started": False,
    "camera_started": False,
    "current_question": 0,
    "questions": [],
    "user_answers": [],
    "username": "",
    "category": "",
    "test_no": 1,
    "no_of_questions": 10,
    "start_time": None,
    "test_submitted": False,
    "test_terminated": False,
}

for key, value in session_defaults.items():
    if key not in st.session_state:
        st.session_state[key] = value


class VideoTransformer(VideoTransformerBase):
    def __init__(self):
        self.face_cascade = cv2.CascadeClassifier(get_opencv_haarcascade("haarcascade_frontalface_default.xml"))
        self.eye_cascade = cv2.CascadeClassifier(get_opencv_haarcascade("haarcascade_eye.xml"))
        self.no_face_warning_count = 0
        self.multiple_face_warning_count = 0
        self.eye_gaze_warning_count = 0
        self.last_no_face_warning_time = time.time()
        self.last_multiple_warning_time = time.time()
        self.last_eye_gaze_warning_time = time.time()
        self.test_terminated = False
        self.no_face_frames = 0
        self.multiple_face_frames = 0
        self.eye_gaze_frames = 0
        self.frame_threshold = 5
        self.warning_interval = 2
        self.warning_limit = 10
        self.proctoring_enabled = False
        self.student_id = None

    def transform(self, frame):
        if not self.proctoring_enabled:
            return frame.to_ndarray(format="bgr24")

        img = frame.to_ndarray(format="bgr24")
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        current_time = time.time()
        violation_message = None

        faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)

        if len(faces) == 0:
            self.no_face_frames += 1
        else:
            self.no_face_frames = 0

        if self.no_face_frames >= self.frame_threshold:
            if current_time - self.last_no_face_warning_time > self.warning_interval:
                self.no_face_warning_count += 1
                self.last_no_face_warning_time = current_time
                if self.student_id:
                    store_face_log(self.student_id, "No Face Detected!")
            violation_message = "No Face Detected!"

        if len(faces) > 1:
            self.multiple_face_frames += 1
        else:
            self.multiple_face_frames = 0

        if self.multiple_face_frames >= self.frame_threshold:
            if current_time - self.last_multiple_warning_time > self.warning_interval:
                self.multiple_face_warning_count += 1
                self.last_multiple_warning_time = current_time
                if self.student_id:
                    store_face_log(self.student_id, "Multiple Faces Detected!")
            violation_message = "Multiple Faces Detected!"

        for (x, y, w, h) in faces:
            cv2.rectangle(img, (x, y), (x + w, y + h), (0, 255, 0), 2)

        if len(faces) == 1:
            (fx, fy, fw, fh) = faces[0]
            face_roi_gray = gray[fy:fy + fh, fx:fx + fw]
            eyes = self.eye_cascade.detectMultiScale(face_roi_gray, scaleFactor=1.1, minNeighbors=5)

            for (ex, ey, ew, eh) in eyes:
                cv2.rectangle(img, (fx + ex, fy + ey), (fx + ex + ew, fy + ey + eh), (255, 0, 0), 2)

            violation_detected = False
            if len(eyes) < 2:
                violation_detected = True
            else:
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
                            if cx < ew / 3 or cx > 2 * ew / 3:
                                violation_detected = True
                    else:
                        violation_detected = True

            if violation_detected:
                self.eye_gaze_frames += 1
            else:
                self.eye_gaze_frames = 0

            if self.eye_gaze_frames >= self.frame_threshold:
                if current_time - self.last_eye_gaze_warning_time > self.warning_interval:
                    self.eye_gaze_warning_count += 1
                    self.last_eye_gaze_warning_time = current_time
                    if self.student_id:
                        store_face_log(self.student_id, "Not Looking at Screen!")
                violation_message = "Not Looking at Screen!"

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
            cv2.putText(
                img,
                violation_message,
                (text_x, text_y),
                font,
                font_scale,
                (255, 255, 255),
                thickness,
                cv2.LINE_AA,
            )

        if (
            self.no_face_warning_count >= self.warning_limit
            or self.multiple_face_warning_count >= self.warning_limit
            or self.eye_gaze_warning_count >= self.warning_limit
        ):
            self.test_terminated = True

        return img


# ---------------------------
# MongoDB Connection and Logging
# ---------------------------
def db_connect():
    client = pymongo.MongoClient("mongodb://localhost:27017/")
    return client['quiz_system']


def store_face_log(student_id, message):
    """Log proctoring violations in the database."""
    db = db_connect()
    collection = db["face_logs"]
    log_data = {
        "student_id": student_id,
        "timestamp": datetime.now(),
        "violation": message
    }
    try:
        collection.insert_one(log_data)
    except Exception as e:
        st.error(f"Error logging data: {e}")


# ---------------------------
# Quiz Functions and Database Operations
# ---------------------------
general_categories = [
    "aptitude",
    "data-interpretation",
    "verbal-ability",
    "logical-reasoning",
    "verbal-reasoning",
    "non-verbal-reasoning"
]

technical_categories = [
    "c-programming",
    "cpp-programming",
    "c-sharp-programming",
    "java-programming"
]


def get_test_number(username, category):
    db = db_connect()
    collection = db["apti_test"]
    latest_test_cursor = collection.find({"student_id": username, "category": category}).sort("timestamp",pymongo.DESCENDING).limit(1)
    latest_test = list(latest_test_cursor)
    return latest_test[0]["test_no"] + 1 if latest_test else 1


def get_test_wise_accuracy(username, category, test_no):
    db = db_connect()
    collection = db['apti_test']
    test_details = collection.find({"student_id": username, "category": category, "test_no": test_no})
    correct_answers = 0
    total_questions = 0
    for test in test_details:
        correct_answers += int(test.get('marks_achieved', 0))
        total_questions += int(test.get('no_of_questions', 0))
    accuracy = float((correct_answers / total_questions) * 100) if total_questions > 0 else 0.0
    return round(accuracy, 2)


def get_average_accuracy(username, category, current_accuracy=None):
    db = db_connect()
    collection = db['apti_test']
    test_details = collection.find({"student_id": username, "category": category})
    total_accuracy = 0.0
    test_count = 0
    for test in test_details:
        test_accuracy = get_test_wise_accuracy(username, category, test['test_no'])
        total_accuracy += float(test_accuracy)
        test_count += 1
    if current_accuracy is not None:
        total_accuracy += float(current_accuracy)
    avg_value = float(total_accuracy / (test_count + 1)) if test_count > 0 else float(current_accuracy) if current_accuracy is not None else 0.0
    return round(avg_value, 2)


def store_test_details(username, test_no, category, no_of_questions, marks_achieved, time_taken, avg_test_accuracy):
    db = db_connect()
    collection = db['apti_test']
    existing_test = collection.find_one({
        "student_id": username,
        "test_no": test_no,
        "category": category
    })
    if existing_test:
        return
    test_data = {
        "student_id": username,
        "timestamp": datetime.now(),
        "category": category,
        "test_no": test_no,
        "no_of_questions": no_of_questions,
        "marks_achieved": marks_achieved,
        "time_taken": time_taken,
        "avg_test_accuracy": avg_test_accuracy
    }
    try:
        collection.insert_one(test_data)
        st.success("Test details stored successfully.")
    except Exception as e:
        st.error(f"Error inserting test data: {e}")


def load_questions(category):
    questions = []
    category_list = general_categories if category == 'General' else technical_categories
    for subcategory in category_list:
        file_name = f"{subcategory}.xlsx"
        file_path = os.path.join(os.path.dirname(__file__), file_name)
        if not os.path.exists(file_path):
            continue

        wb = load_workbook(file_path)
        sheet = wb.active
        if sheet is None:
            continue

        for row in sheet.iter_rows(min_row=2):
            question_no = row[0].value
            question_text = row[1].value
            options_value = row[2].value
            answer = row[3].value
            explanation = row[4].value
            img_path = None

            if question_text:
                for img in getattr(sheet, "_images", []):
                    anchor = getattr(img, "anchor", None)
                    anchor_from = getattr(anchor, "_from", None)
                    anchor_row = getattr(anchor_from, "row", None)
                    current_row = int(row[0].row) if row[0] is not None else 0
                    if anchor_row is not None and int(anchor_row) == current_row - 1:
                        img_stream = io.BytesIO()
                        pil_image = PILImage.open(io.BytesIO(img._data()))
                        pil_image.save(img_stream, format='PNG')
                        img_stream.seek(0)
                        image_data = base64.b64encode(img_stream.read()).decode('utf-8')
                        img_path = f"data:image/png;base64,{image_data}"
                        break

            if question_no and question_text and options_value and answer:
                option_text = str(options_value)
                if subcategory == 'non-verbal-reasoning':
                    options_list = option_text.splitlines()
                else:
                    options_list = option_text.split(';')
                options_list = [option.strip() for option in options_list if str(option).strip()]
                labeled_options = {chr(65 + i): option for i, option in enumerate(options_list)}
                answer_text = str(answer).strip()
                if answer_text.upper() in labeled_options:
                    correct_label = answer_text.upper()
                elif answer_text.upper().startswith("OPTION "):
                    option_letter = answer_text.upper().replace("OPTION ", "").strip()
                    correct_label = option_letter if option_letter in labeled_options else "Unknown"
                else:
                    correct_label = "Unknown"
                    for label, option in labeled_options.items():
                        if str(option).strip().lower() == answer_text.lower():
                            correct_label = label
                            break
                if correct_label is None:
                    correct_label = "Unknown"
                questions.append({
                    'question_no': question_no,
                    'question_text': question_text,
                    'image_data': img_path,
                    'options': options_list,
                    'labeled_options': labeled_options,
                    'correct_answer': correct_label,
                    'explanation': explanation.strip() if isinstance(explanation, str) and explanation.strip() else "No explanation available."
                })
    return questions


def rerun_app():
    if hasattr(st, 'rerun'):
        st.rerun()
    else:
        experimental_rerun = getattr(st, 'experimental_rerun', None)
        if callable(experimental_rerun):
            experimental_rerun()
        else:
            st.error("Rerun not supported in this version of Streamlit. Please upgrade Streamlit.")


# ---------------------------
# Streamlit UI
# ---------------------------
st.title("🧠 AptiQuiz - Practice Your Skills!")

# RTC configuration for webrtc_streamer.
RTC_CONFIGURATION = RTCConfiguration({
    "iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]
})

# Sidebar: Live Camera Feed, Warnings, and Question Navigation
st.sidebar.title("Live Camera Feed")
camera = None
with st.sidebar:
    try:
        camera = cast(Any, webrtc_streamer)(
            key="camera",
            video_transformer_factory=lambda: VideoTransformer(),
            rtc_configuration=RTC_CONFIGURATION,
            async_processing=True,
            media_stream_constraints={"video": True, "audio": False},
        )
    except Exception as e:
        st.error(f"Error initializing camera: {e}")
        camera = None

    # Display warning counts for face detection and eye gaze.
    if camera is not None:
        video_transformer = getattr(camera, "video_transformer", None)
        if video_transformer is not None:
            st.markdown(f"**No Face Warnings:** {video_transformer.no_face_warning_count}")
            st.markdown(f"**Multiple Face Warnings:** {video_transformer.multiple_face_warning_count}")
            st.markdown(f"**Eye-Gaze Warnings:** {video_transformer.eye_gaze_warning_count}")

    st.markdown("---")

    # Custom container for question navigation with circular buttons
    st.markdown('<div id="question-nav">', unsafe_allow_html=True)
    st.markdown("""
    <style>
    #question-nav .stButton button {
        border-radius: 50% !important;
        width: 40px !important;
        height: 40px !important;
        padding: 0 !important;
        font-size: 14px !important;
        margin: 2px;
    }
    </style>
    """, unsafe_allow_html=True)

    if "questions" in st.session_state and st.session_state.questions:
        st.markdown("### Jump to Question")
        num_questions = len(st.session_state.questions)
        cols_per_row = 5
        rows = (num_questions + cols_per_row - 1) // cols_per_row
        for row in range(rows):
            cols = st.columns(cols_per_row)
            for col_index in range(cols_per_row):
                question_index = row * cols_per_row + col_index
                if question_index < num_questions:
                    button_label = str(question_index + 1)

                    # Check if the question is answered
                    is_answered = st.session_state.user_answers[question_index] is not None

                    # Create button with conditional color based on answered status
                    button_style = "background-color: #4CAF50; color: white;" if is_answered else ""

                    button_html = f"""
                    <button style="border-radius: 50%; width: 40px; height: 40px; font-size: 14px; {button_style}">
                        {button_label}
                    </button>
                    """
                    
                    # Display the button in the column
                    with cols[col_index]:
                        st.markdown(button_html, unsafe_allow_html=True)

                        # Button action - if clicked, go to the respective question
                        if st.button(button_label, key=f"qbutton_{question_index}"):
                            st.session_state.current_question = question_index
                            rerun_app()

    st.markdown('</div>', unsafe_allow_html=True)

    # Update camera_started flag based on camera state.
    # Modified: If the quiz has already started, we assume quiz section should be shown.
    if st.session_state.get("started", False) or (
            camera and hasattr(camera, "state") and getattr(camera.state, "playing", False)):
        st.session_state.camera_started = True
    else:
        st.session_state.camera_started = False

# Determine whether to show the quiz:
# Show quiz if quiz has started OR if camera is started.
if not (st.session_state.get("started", False) or st.session_state.get("camera_started", False)):
    st.warning("Please start your camera from the left sidebar before starting the quiz!")
    if st.button("Retry Camera"):
        rerun_app()
else:
    with st.container():
        username = ""
        category = "General"
        if "started" not in st.session_state or not st.session_state.started:
            username = st.text_input("Enter your username:")
            category = st.radio("Choose a category:", ['General', 'Technical'])

            test_no = 1
            if username:
                test_no = get_test_number(username, category)
                st.write(f"Test Number: {test_no}")

            test_type = st.radio(
                "Select Your Test Mode:",
                ["⚡ Quick Challenge (10 Questions)", "🏆 Full Test (30 Questions)"],
            )
            no_of_questions = 10 if "Quick Challenge" in test_type else 30

            if st.button("Start Quiz"):
                # Validate username
                if username.strip() == "":
                    st.error("Please enter your username.")
                    st.stop()
                # Load questions
                questions = load_questions(category)
                st.write("Questions Loaded:", len(questions))  # Debug
                if len(questions) == 0:
                    st.error("No questions found. Check your Excel files.")
                    st.stop()
                # Shuffle questions
                random.shuffle(questions)
                # Select required number of questions
                questions = questions[:no_of_questions]
                # Save data into session state
                st.session_state.started = True
                st.session_state.username = username
                st.session_state.category = category
                st.session_state.test_no = test_no
                st.session_state.no_of_questions = len(questions)

                st.session_state.questions = questions
                st.session_state.current_question = 0
                st.session_state.user_answers = [None] * len(questions)

                # Timer
                st.session_state.start_time = time.time()

                st.session_state.test_submitted = False
                st.session_state.test_terminated = False

                # Enable camera proctoring
                if camera is not None:
                    video_transformer = getattr(camera, "video_transformer", None)
                    if video_transformer is not None:
                        video_transformer.proctoring_enabled = True
                        video_transformer.student_id = username
                st.success("Quiz Started Successfully!")
                st.write("DEBUG started:", st.session_state.started)
                st.write("DEBUG question count:", len(st.session_state.questions))
                st.write("DEBUG current question:", st.session_state.current_question)
                rerun_app()

    st.markdown("---")
    if (
        st.session_state.started
        and len(st.session_state.questions) > 0
        and (
            st.session_state.test_submitted
            or st.session_state.current_question >= len(st.session_state.questions)
            or st.session_state.test_terminated
            )
        ):
        # Disable proctoring and reset warnings once the test is over.
        if camera is not None:
            video_transformer = getattr(camera, "video_transformer", None)
            if video_transformer is not None:
                video_transformer.proctoring_enabled = False
                video_transformer.no_face_warning_count = 0
                video_transformer.multiple_face_warning_count = 0
                video_transformer.eye_gaze_warning_count = 0

        with st.container():
            st.markdown("---")
            end_time = time.time()
            time_taken = round(end_time - st.session_state.start_time, 2)
            score = 0
            for i, q in enumerate(st.session_state.questions):
                if st.session_state.user_answers[i] == q["correct_answer"]:
                    score += 1
            st.header("🎉 Quiz Completed!")
            st.write(f"**Your Score:** {score} / {len(st.session_state.questions)}")
            st.write(f"**Time Taken:** {time_taken} seconds")
            if st.session_state.get("test_terminated", False):
                st.error("Your test was terminated due to proctoring violations.")
            st.subheader("📚 Correct Answers, Solutions & Explanations")
            for i, q in enumerate(st.session_state.questions):
                if i >= len(st.session_state.user_answers):
                    break
                user_ans = st.session_state.user_answers[i]
                correct_ans = q["correct_answer"]
                user_ans = str(user_ans).strip().upper() if user_ans is not None else ""
                correct_ans = str(correct_ans).strip().upper() if correct_ans is not None else ""
                st.markdown(f"### Q{i + 1}: {q['question_text']}")
                if q["image_data"]:
                    st.image(
                        q["image_data"],
                        use_container_width=True
                    )
                    st.markdown("**Options:**")  
                    for label, option in q["labeled_options"].items():  
                        if label == correct_ans:
                            st.markdown(
                                f"✅ **{label}: {option} — Correct Answer**"
                                )
                        elif label == user_ans:
                            st.markdown(f"❌ **{label}: {option} — Your Answer**")
                        else:
                            st.markdown(  f"• **{label}: {option}**")
                        st.markdown("---")
                        st.markdown(f"### ✅ Correct Answer: **{correct_ans}**" )
                        if user_ans == correct_ans:
                            st.success(  f"✅ Your Answer: {user_ans} — Correct!")
                        else:
                            st.error( f"❌ Your Answer: "f"{user_ans if user_ans else 'Not Answered'} — Wrong" )
                        st.markdown("### 💡 Explanation / Solution")
                        explanation = q.get("explanation", "")
                        if explanation and explanation.strip():
                            st.info(explanation)
                        else:
                            st.warning(  "No explanation/solution is available for this question." )
                        st.write("---")
    

            current_accuracy = get_test_wise_accuracy(
                st.session_state.username, st.session_state.category, st.session_state.test_no
            )
            avg_test_accuracy = get_average_accuracy(
                st.session_state.username, st.session_state.category, current_accuracy
            )
            store_test_details(
                st.session_state.username,
                st.session_state.test_no,
                st.session_state.category,
                st.session_state.no_of_questions,
                score,
                time_taken,
                avg_test_accuracy
            )
            if st.button("Try Again"):
                st.session_state.started = False
                for key in ["username", "category", "test_no", "questions", "current_question", "user_answers",
                            "start_time", "test_terminated", "test_submitted"]:
                    if key in st.session_state:
                        del st.session_state[key]
                rerun_app()

    elif st.session_state.get("started", False):
        # If the quiz is in progress, display the current question.
        with st.container():
            current_index = st.session_state.current_question
            question_data = st.session_state.questions[current_index]
            with st.form(key="question_form"):
                st.header(f"Question {current_index + 1} / {len(st.session_state.questions)}")
                st.write(question_data["question_text"])
                if question_data["image_data"]:
                    st.image(question_data["image_data"], use_container_width=True)
                options = list(question_data["labeled_options"].keys())
                default_answer = st.session_state.user_answers[current_index]
                default_index = options.index(default_answer) if default_answer in options else 0
                user_choice = st.radio(
                    "Choose your answer:",
                    options,
                    index=default_index,
                    format_func=lambda x: f"{x}: {question_data['labeled_options'][x]}"
                )
                col1, col2, col3 = st.columns(3)
                with col1:
                    prev_pressed = st.form_submit_button("Previous")
                with col2:
                    next_pressed = st.form_submit_button("Next")
                with col3:
                    submit_pressed = st.form_submit_button("Submit Test")
                st.session_state.user_answers[current_index] = user_choice
                if prev_pressed:
                    if current_index > 0:
                        st.session_state.current_question -= 1
                    else:
                        st.warning("This is the first question.")
                    rerun_app()
                elif next_pressed:
                    if current_index < len(st.session_state.questions) - 1:
                        st.session_state.current_question += 1
                    else:
                        st.warning("This is the last question.")
                    rerun_app()
                elif submit_pressed:
                    st.session_state.test_submitted = True
                    rerun_app()