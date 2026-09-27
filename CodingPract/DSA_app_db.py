import inspect
import os
import re
import subprocess
import time
from datetime import datetime, timedelta

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components
from pymongo import MongoClient
from streamlit_ace import st_ace

# ==========================================
# Database Configuration
# ==========================================
# Use a 2-second server selection timeout to prevent app hanging if MongoDB is offline
try:
    client = MongoClient('mongodb://localhost:27017/', serverSelectionTimeoutMS=2000)
    db = client['DSA_code_app_db']
    collection = db['submissions']
except Exception:
    client, db, collection = None, None, None

DSA_MAX_DURATION_SECONDS = 5 * 60

# ==========================================
# Application Setup & Data Loading
# ==========================================
st.set_page_config(page_title="DSA Practice", page_icon="🧩", layout="wide")

QUESTIONS_FILE = "question_details.csv"

def load_questions_data():
    """Load and normalize questions dataset."""
    try:
        df = pd.read_csv(QUESTIONS_FILE)
    except Exception:
        df = pd.DataFrame(columns=["QID", "title", "difficulty", "topics", "Body", "Hints", "isPaidOnly"])
    
    # Standardize key column names regardless of CSV header casing
    col_map = {}
    for c in df.columns:
        clow = c.lower()
        if clow == 'qid':
            col_map[c] = 'QID'
        elif clow == 'title':
            col_map[c] = 'title'
        elif clow == 'difficulty':
            col_map[c] = 'difficulty'
        elif clow == 'topics':
            col_map[c] = 'topics'
        elif clow == 'body':
            col_map[c] = 'Body'
        elif clow == 'hints':
            col_map[c] = 'Hints'
        elif clow == 'ispaidonly':
            col_map[c] = 'isPaidOnly'
    df = df.rename(columns=col_map)

    if "topics" in df.columns:
        df["topics"] = df["topics"].fillna("[]")
        df["topics"] = df["topics"].apply(
            lambda x: [t.strip() for t in x.strip("[]").replace("'", "").replace('"', "").split(",") if t.strip()]
            if isinstance(x, str) else (x if isinstance(x, list) else [])
        )

    if 'Status' not in df.columns:
        df['Status'] = 'Pending'

    return df

questions_df = load_questions_data()


# ==========================================
# Helper Functions
# ==========================================
def fetch_user_submissions(username):
    """Fetch user submission data from MongoDB with integer normalized QIDs."""
    if collection is None:
        return {}
    try:
        submissions = collection.find({"username": username})
        submission_data = {}
        for entry in submissions:
            try:
                qid_key = int(entry["qid"])
            except (ValueError, TypeError):
                qid_key = entry["qid"]
            submission_data[qid_key] = {
                "status": entry.get("status", "submitted"),
                "time_taken": entry.get("time_taken", "N/A")
            }
        return submission_data
    except Exception:
        return {}


def clean_html(raw_html):
    """Remove HTML tags and decode HTML entities."""
    if not isinstance(raw_html, str):
        return ""
    
    html_entities = {
        "&nbsp;": " ",
        "&quot;": '"',
        "&gt;": ">",
        "&lt;": "<",
        "&amp;": "&"
    }
    for entity, replacement in html_entities.items():
        raw_html = raw_html.replace(entity, replacement)
    
    # Preserve formatting for newlines
    raw_html = raw_html.replace('<br>', '\n').replace('<br/>', '\n').replace('</p>', '\n')
    cleanr = re.compile('<.*?>')
    return re.sub(cleanr, '', raw_html)


def extract_test_cases(description):
    """Extract input/output test cases from question description."""
    test_cases = []
    
    # Primary regex for standard input/output blocks
    pattern = re.compile(
        r'Input:\s*(.*?)\s*Output:\s*(.*?)(?=\s*Explanation:|\s*Example|\s*Input:|$)',
        re.IGNORECASE | re.DOTALL
    )
    matches = pattern.findall(description)
    
    for inp, outp in matches:
        inp_lines = [line.strip() for line in inp.strip().splitlines() if line.strip()]
        inp_str = ", ".join(inp_lines)
        
        outp_lines = [line.strip() for line in outp.strip().splitlines() if line.strip()]
        outp_str = outp_lines[0] if outp_lines else ""
        
        if inp_str and outp_str:
            test_cases.append({"input": inp_str, "output": outp_str})
    
    # Fallback regex for single-line inline inputs
    if not test_cases:
        input_pattern = re.compile(r'Input:\s*(.+)', re.IGNORECASE)
        output_pattern = re.compile(r'Output:\s*(.+)', re.IGNORECASE)
        inputs = [line.strip() for line in input_pattern.findall(description)]
        outputs = [line.strip() for line in output_pattern.findall(description)]
        for i in range(min(len(inputs), len(outputs))):
            test_cases.append({"input": inputs[i], "output": outputs[i]})
            
    return test_cases


def get_language_structure(language):
    """Return starter code template for the chosen programming language."""
    if language == "Python":
        return (
            "# Definition for singly-linked list.\n"
            "# class ListNode:\n"
            "#     def __init__(self, val=0, next=None):\n"
            "#         self.val = val\n"
            "#         self.next = next\n"
            "class Solution:\n"
            "    def solve(self, param1):\n"
            "        # Write your solution code here\n"
            "        return None\n"
        )
    elif language == "Java":
        return (
            "import java.util.*;\n\n"
            "public class Solution {\n"
            "    public static void main(String[] args) {\n"
            "        Scanner sc = new Scanner(System.in);\n"
            "        // Read input from System.in and print solution\n"
            "    }\n"
            "}"
        )
    elif language == "C":
        return (
            "#include <stdio.h>\n\n"
            "int main() {\n"
            "    // Read input from stdin and print solution\n"
            "    return 0;\n"
            "}"
        )
    elif language == "C++":
        return (
            "#include <iostream>\n"
            "#include <vector>\n"
            "#include <string>\n"
            "using namespace std;\n\n"
            "int main() {\n"
            "    // Read input from cin and print solution\n"
            "    return 0;\n"
            "}"
        )
    return ""


def format_time(seconds):
    """Format total seconds into HH:MM:SS."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hours:02}:{minutes:02}:{secs:02}"


def normalize_output(text):
    """Normalize output for comparison (lowercase and ignore spaces)."""
    if text is None:
        return ""
    return str(text).strip().lower().replace(" ", "")


def execute_code(language, code, test_case):
    """Execute user code dynamically across Python, Java, C, and C++."""
    input_str = test_case['input'].strip()
    temp_file = None
    executable = None
    java_class = None

    try:
        # ==========================================
        # 1. Python Execution Engine
        # ==========================================
        if language == "Python":
            timestamp = int(time.time() * 1000)
            temp_file = f"temp_script_{timestamp}.py"
            
            raw_lines = [line.strip() for line in input_str.splitlines() if line.strip()]
            joined_input = ", ".join(raw_lines)

            # Clean variable assignments (e.g., 'l1 = [2,4,3], l2 = [5,6,4]' -> '[2,4,3], [5,6,4]')
            clean_input = re.sub(r'^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*', '', joined_input)
            clean_input = re.sub(r',\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*', ', ', clean_input)

            # Map JSON literals to Python equivalents
            clean_input = re.sub(r'\bnull\b', 'None', clean_input)
            clean_input = re.sub(r'\btrue\b', 'True', clean_input)
            clean_input = re.sub(r'\bfalse\b', 'False', clean_input)

            # Construct runner script with ListNode, TreeNode, and automatic list <-> linkedlist/tree converters
            runner_script = code + "\n\n" + """import inspect
import sys
import copy
from typing import Optional, List, Dict, Set, Tuple

# Standard LeetCode data structure definitions
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
    def __repr__(self):
        vals = []
        curr = self
        while curr and len(vals) < 1000:
            vals.append(curr.val)
            curr = curr.next
        return str(vals)

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def list_to_linkedlist(arr):
    if not isinstance(arr, list):
        return arr
    dummy = ListNode(0)
    curr = dummy
    for val in arr:
        curr.next = ListNode(val)
        curr = curr.next
    return dummy.next

def linkedlist_to_list(head):
    res = []
    curr = head
    while curr and len(res) < 1000:
        res.append(curr.val)
        curr = curr.next
    return res

def list_to_tree(arr):
    if not isinstance(arr, list) or not arr:
        return None
    nodes = [TreeNode(val) if val is not None else None for val in arr]
    kids = nodes[::-1]
    root = kids.pop()
    for node in nodes:
        if node:
            if kids: node.left = kids.pop()
            if kids: node.right = kids.pop()
    return root

def tree_to_list(root):
    if not root:
        return []
    res = []
    queue = [root]
    while queue:
        node = queue.pop(0)
        if node:
            res.append(node.val)
            queue.append(node.left)
            queue.append(node.right)
        else:
            res.append(None)
    while res and res[-1] is None:
        res.pop()
    return res

def convert_arg(param_name, arg, annotation=None):
    if not isinstance(arg, list):
        return arg
    p_lower = param_name.lower()
    annot_str = str(annotation) if annotation else ""
    if 'listnode' in annot_str.lower() or any(k in p_lower for k in ['l1', 'l2', 'head', 'list1', 'list2']):
        return list_to_linkedlist(arg)
    if 'treenode' in annot_str.lower() or any(k in p_lower for k in ['root', 'tree']):
        return list_to_tree(arg)
    return arg

clean_in = """ + repr(clean_input) + """
raw_in = """ + repr(input_str) + """

def __run_test():
    # A. Solution class handling
    if 'Solution' in globals() and inspect.isclass(globals()['Solution']):
        sol = Solution()
        cls_dict = Solution.__dict__
        methods = [m for m in cls_dict if not m.startswith('__') and callable(getattr(sol, m, None))]
        if not methods:
            methods = [m for m in dir(sol) if not m.startswith('__') and callable(getattr(sol, m, None))]
            
        if methods:
            func = getattr(sol, methods[0])
            
            try:
                args = eval("(" + clean_in + ",)")
            except Exception:
                try:
                    args = eval("(" + raw_in + ",)")
                except Exception as e:
                    print("Error parsing input:", e)
                    return

            sig = inspect.signature(func)
            params = list(sig.parameters.values())

            converted_args = []
            for i, arg in enumerate(args):
                if i < len(params):
                    p = params[i]
                    c_arg = convert_arg(p.name, arg, p.annotation)
                    converted_args.append(c_arg)
                else:
                    converted_args.append(arg)

            args_copy = copy.deepcopy(args)
            try:
                res = func(*converted_args)
            except AttributeError as ae:
                if 'list' in str(ae).lower():
                    try:
                        ll_args = [list_to_linkedlist(a) if isinstance(a, list) else a for a in args]
                        res = func(*ll_args)
                    except Exception as e2:
                        print("Runtime Error:", e2)
                        return
                else:
                    print("Runtime Error:", ae)
                    return
            except Exception as e:
                print("Runtime Error:", e)
                return

            if isinstance(res, ListNode):
                print(linkedlist_to_list(res))
            elif isinstance(res, TreeNode):
                print(tree_to_list(res))
            elif res is not None:
                print(res)
            else:
                if args and args[0] != args_copy[0]:
                    print(args[0])
                else:
                    print(res)
        else:
            print("No method found in Solution class")
            
    # B. Standalone function handling
    else:
        user_funcs = [
            obj for name, obj in list(globals().items()) 
            if inspect.isfunction(obj) and obj.__module__ == '__main__' and name != '__run_test'
        ]
        if user_funcs:
            func = user_funcs[-1]
            try:
                args = eval("(" + clean_in + ",)")
            except Exception:
                try:
                    args = eval("(" + raw_in + ",)")
                except Exception as e:
                    print("Error parsing input:", e)
                    return

            sig = inspect.signature(func)
            params = list(sig.parameters.values())

            converted_args = []
            for i, arg in enumerate(args):
                if i < len(params):
                    p = params[i]
                    c_arg = convert_arg(p.name, arg, p.annotation)
                    converted_args.append(c_arg)
                else:
                    converted_args.append(arg)

            args_copy = copy.deepcopy(args)
            try:
                res = func(*converted_args)
            except AttributeError as ae:
                if 'list' in str(ae).lower():
                    try:
                        ll_args = [list_to_linkedlist(a) if isinstance(a, list) else a for a in args]
                        res = func(*ll_args)
                    except Exception as e2:
                        print("Runtime Error:", e2)
                        return
                else:
                    print("Runtime Error:", ae)
                    return
            except Exception as e:
                print("Runtime Error:", e)
                return

            if isinstance(res, ListNode):
                print(linkedlist_to_list(res))
            elif isinstance(res, TreeNode):
                print(tree_to_list(res))
            elif res is not None:
                print(res)
            else:
                if args and args[0] != args_copy[0]:
                    print(args[0])
                else:
                    print(res)
        else:
            print("No executable function found")

__run_test()
"""
            with open(temp_file, 'w', encoding='utf-8') as f:
                f.write(runner_script)
            result = subprocess.run(['python', temp_file], capture_output=True, text=True, timeout=10)

        # ==========================================
        # 2. Java Execution Engine
        # ==========================================
        elif language == "Java":
            temp_file = "Solution.java"
            java_class = "Solution.class"
            with open(temp_file, 'w', encoding='utf-8') as f:
                f.write(code)
            compile_result = subprocess.run(['javac', temp_file], capture_output=True, text=True, timeout=10)
            if compile_result.returncode != 0:
                return f"Compilation Error:\n{compile_result.stderr.strip()}"
            result = subprocess.run(['java', 'Solution'], input=input_str, capture_output=True, text=True, timeout=10)

        # ==========================================
        # 3. C Execution Engine
        # ==========================================
        elif language == "C":
            timestamp = int(time.time() * 1000)
            temp_file = f"temp_script_{timestamp}.c"
            executable = f"temp_script_{timestamp}.exe"
            with open(temp_file, 'w', encoding='utf-8') as f:
                f.write(code)
            compile_result = subprocess.run(['gcc', temp_file, '-o', executable], capture_output=True, text=True, timeout=10)
            if compile_result.returncode != 0:
                return f"Compilation Error:\n{compile_result.stderr.strip()}"
            result = subprocess.run([executable], input=input_str, capture_output=True, text=True, timeout=10)

        # ==========================================
        # 4. C++ Execution Engine
        # ==========================================
        elif language == "C++":
            timestamp = int(time.time() * 1000)
            temp_file = f"temp_script_{timestamp}.cpp"
            executable = f"temp_script_{timestamp}.exe"
            with open(temp_file, 'w', encoding='utf-8') as f:
                f.write(code)
            compile_result = subprocess.run(['g++', temp_file, '-o', executable], capture_output=True, text=True, timeout=10)
            if compile_result.returncode != 0:
                return f"Compilation Error:\n{compile_result.stderr.strip()}"
            result = subprocess.run([executable], input=input_str, capture_output=True, text=True, timeout=10)
        
        return result.stdout.strip() if result.returncode == 0 else result.stderr.strip()

    finally:
        # File Cleanup Safety
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception:
                pass
        if executable and os.path.exists(executable):
            try:
                os.remove(executable)
            except Exception:
                pass
        if java_class and os.path.exists(java_class):
            try:
                os.remove(java_class)
            except Exception:
                pass


def store_submission_data(username, qid, difficulty, cleaned_topics, code_lang, time_taken, code,
                          passed_test_cases, total_test_cases):
    """Store submission details in MongoDB."""
    if collection is None:
        return
    previous_attempts = collection.count_documents({"username": username, "qid": int(qid)}) if collection is not None else 0
    submission_data = {
        "username": username,
        "qid": int(qid),
        "difficulty": difficulty,
        "topics": cleaned_topics,
        "coding_lang": code_lang,
        "time_taken": time_taken,
        "status": "accepted" if passed_test_cases == total_test_cases else "rejected",
        "passed_test_cases": passed_test_cases,
        "total_test_cases": total_test_cases,
        "coding_score": round((passed_test_cases / total_test_cases) * 100, 2) if total_test_cases else 0,
        "submitted_code": code,
        "attempt_number": previous_attempts + 1,
        "timestamp": datetime.now()
    }
    try:
        collection.insert_one(submission_data)
        st.success("Submission successfully recorded in database!")
    except Exception as e:
        st.warning(f"Could not save submission to MongoDB: {e}")


# ==========================================
# Streamlit UI & Application Controller
# ==========================================
query_params = st.query_params
selected_qid = query_params.get("qid", None)

if isinstance(selected_qid, list):
    selected_qid = selected_qid[0]
if selected_qid is not None:
    try:
        selected_qid = int(selected_qid)
    except ValueError:
        selected_qid = None

st.header("🧩 DSA Practice Platform")

username = st.text_input("Enter your username", autocomplete="username")

def dsa_is_unlocked(student_id):
    """Prevent direct DSA access before the central placement workflow unlocks it."""
    try:
        client = MongoClient('mongodb://localhost:27017/', serverSelectionTimeoutMS=2000)
        student_db = client['studentDB']
        progress = student_db['placementprogresses'].find_one({"studentId": student_id}, {"aptitude.status": 1})
        if progress and progress.get("aptitude", {}).get("status") == "QUALIFIED":
            return True
        latest = client['quiz_system']['apti_test'].find_one({"student_id": student_id}, sort=[("timestamp", -1)])
        config = student_db['assessmentconfigs'].find_one({"key": "default"}) or {"aptitudeMinScore": 50}
        if latest and int(latest.get("no_of_questions", 0)) > 0:
            qualified = (float(latest.get("marks_achieved", 0)) / float(latest["no_of_questions"]) * 100) >= float(config.get("aptitudeMinScore", 60))
            if qualified:
                student_db['placementprogresses'].update_one(
                    {"studentId": student_id},
                    {"$set": {"studentId": student_id, "aptitude.status": "QUALIFIED", "dsa.status": "AVAILABLE"}},
                    upsert=True
                )
            return qualified
        return False
    except Exception:
        return False


def start_dsa_session(student_id):
    """Create one persisted DSA session and resume it without resetting the deadline."""
    client = MongoClient('mongodb://localhost:27017/', serverSelectionTimeoutMS=2000)
    progress = client['studentDB']['placementprogresses']
    current = progress.find_one({"studentId": student_id}, {"dsa": 1})
    dsa = (current or {}).get("dsa", {})
    if dsa.get("submitted") is True:
        return current
    if not dsa.get("startedAt"):
        started_at = datetime.utcnow()
        progress.update_one(
            {"studentId": student_id},
            {"$setOnInsert": {"studentId": student_id},
             "$set": {
                 "dsa.startedAt": started_at,
                 "dsa.deadline": started_at + timedelta(seconds=DSA_MAX_DURATION_SECONDS),
                 "dsa.completed": False,
                 "dsa.submitted": False,
                 "dsa.durationQualified": False
             }},
            upsert=True
        )
    elif not dsa.get("deadline"):
        progress.update_one(
            {"studentId": student_id},
            {"$set": {"dsa.deadline": dsa["startedAt"] + timedelta(seconds=DSA_MAX_DURATION_SECONDS)}}
        )
    session = progress.find_one({"studentId": student_id}, {"dsa": 1})
    if session and session.get("dsa", {}).get("deadline") <= datetime.utcnow():
        return finalize_dsa_session(student_id, "automatic")
    return session


def finalize_dsa_session(student_id, submission_type):
    """Finalize once using the persisted server deadline; repeated calls are idempotent."""
    client = MongoClient('mongodb://localhost:27017/', serverSelectionTimeoutMS=2000)
    progress = client['studentDB']['placementprogresses']
    session = progress.find_one({"studentId": student_id}, {"dsa": 1})
    dsa = (session or {}).get("dsa", {})
    if not dsa.get("startedAt"):
        raise ValueError("DSA attempt has not started.")
    if dsa.get("submitted") is True:
        return session
    now = datetime.utcnow()
    deadline = dsa.get("deadline") or (dsa["startedAt"] + timedelta(seconds=DSA_MAX_DURATION_SECONDS))
    elapsed_seconds = max(0, int((now - dsa["startedAt"]).total_seconds()))
    if elapsed_seconds < DSA_MAX_DURATION_SECONDS:
        raise ValueError("DSA round requires a minimum of 5 minutes. Please continue until the timer reaches 00:00.")
    submitted_at = now
    duration_seconds = elapsed_seconds
    progress.update_one(
        {"studentId": student_id, "dsa.submitted": {"$ne": True}},
        {"$set": {
            "dsa.deadline": deadline,
            "dsa.completedAt": submitted_at,
            "dsa.submittedAt": submitted_at,
            "dsa.durationSeconds": duration_seconds,
            "dsa.completed": True,
            "dsa.submitted": True,
            "dsa.submissionType": submission_type,
            "dsa.durationQualified": True
        }}
    )
    return progress.find_one({"studentId": student_id}, {"dsa": 1})

if 'username' not in st.session_state:
    st.session_state['username'] = username

if username:
    if not dsa_is_unlocked(username):
        st.error("DSA Practice is locked. Qualify in the Aptitude Round first.")
        st.stop()
    try:
        dsa_session = start_dsa_session(username)
    except Exception as error:
        st.error(f"Unable to start the server-tracked DSA session: {error}")
        st.stop()
    dsa = (dsa_session or {}).get("dsa", {})
    dsa_submitted = dsa.get("submitted") is True
    dsa_deadline = dsa.get("deadline")
    remaining_seconds = max(0, int((dsa_deadline - datetime.utcnow()).total_seconds())) if dsa_deadline else 0
    if dsa_submitted:
        st.success(f"DSA assessment finalized ({dsa.get('submissionType', 'manual')}). Further submissions are disabled.")
    else:
        st.info(f"Time Remaining: {remaining_seconds // 60:02}:{remaining_seconds % 60:02}")
    st.session_state['submissions'] = fetch_user_submissions(username)

    if dsa_deadline and not dsa_submitted:
        def render_dsa_timer():
            """Poll the persisted deadline so expiry finalizes without user interaction."""
            current_session = start_dsa_session(username)
            current_dsa = (current_session or {}).get("dsa", {})
            current_deadline = current_dsa.get("deadline")
            if current_dsa.get("submitted") is True:
                st.rerun()

            if current_deadline:
                remaining = max(0, int((current_deadline - datetime.utcnow()).total_seconds()))
                if remaining == 0:
                    finalize_dsa_session(username, "automatic")
                    st.rerun()

                mins, secs = divmod(remaining, 60)
                st.markdown(
                    f"""
                    <div style="font-family: sans-serif; background: #181825; color: #a6e3a1;
                        padding: 14px; border-radius: 10px; text-align: center;
                        border: 1px solid #313244; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <div style="font-size: 11px; font-weight: 600; color: #cdd6f4;
                            letter-spacing: 1px; margin-bottom: 6px;">TIME REMAINING</div>
                        <div style="font-size: 26px; font-weight: bold;
                            font-family: 'Courier New', Courier, monospace;">{mins:02}:{secs:02}</div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

        fragment = getattr(st, "fragment", None)
        if fragment is not None:
            @fragment(run_every="1s")
            def timer_fragment():
                render_dsa_timer()

            timer_fragment()
        else:
            render_dsa_timer()

    # --------------------------------------
    # Detailed Question Solving View
    # --------------------------------------
    if selected_qid is not None:
        if st.session_state.get('current_qid') != selected_qid:
            st.session_state['current_qid'] = selected_qid
            st.session_state['test_case_results'] = {}
            st.session_state['start_time'] = datetime.now()

        # Match QID numerically or as string
        if "QID" in questions_df.columns:
            question_data = questions_df[pd.to_numeric(questions_df['QID'], errors='coerce') == selected_qid]
        else:
            question_data = pd.DataFrame()

        if not question_data.empty:
            body_val = question_data.iloc[0].get('Body', '')
            description = clean_html(str(body_val))
            test_cases = extract_test_cases(description)

            col1, col2 = st.columns([1, 1])
            with col1:
                st.subheader(f"QID {selected_qid}: {question_data.iloc[0].get('title', '')}")
                st.write("---")
                st.write(description.split("Example")[0].strip())

                with st.expander("Test Cases Preview"):
                    for idx, test_case in enumerate(test_cases):
                        st.write(f"**Test Case {idx + 1}:**")
                        st.write(f"*Input:* `{test_case['input']}`")
                        st.write(f"*Expected Output:* `{test_case['output']}`")

                st.write("---")

                hints = question_data.iloc[0].get('Hints', '[]')
                if hints != '[]' and pd.notna(hints):
                    hints_list = str(hints).strip('[]').replace('"', '').replace("'", "").split(",")
                    with st.expander("Hints"):
                        st.markdown("---")
                        for hint in hints_list:
                            st.write(f"- {hint.strip()}")

            with col2:
                st.subheader("Code Workspace")

                language = st.selectbox("Select Language", ["Python", "Java", "C", "C++"])
                function_structure = get_language_structure(language)

                ace_mode = "c_cpp" if language in ["C", "C++"] else language.lower()
                editor_state_key = f"code_{selected_qid}_{language}"
                if editor_state_key not in st.session_state:
                    st.session_state[editor_state_key] = function_structure

                code = st_ace(
                    language=ace_mode,
                    theme='monokai',
                    height=350,
                    value=st.session_state[editor_state_key],
                    key=f"editor_{selected_qid}_{language}",
                    readonly=dsa_submitted,
                    auto_update=not dsa_submitted
                )
                if code is not None:
                    st.session_state[editor_state_key] = code

                if 'test_case_results' not in st.session_state:
                    st.session_state['test_case_results'] = {}

                st.write("---")
                run_all_button = st.button("▶ Run All Test Cases", type="primary", use_container_width=True, disabled=dsa_submitted)

                if run_all_button:
                    if start_dsa_session(username).get("dsa", {}).get("submitted") is True:
                        st.error("The DSA assessment has expired or was already submitted.")
                        st.stop()
                    st.session_state['test_case_results'] = {}
                    all_passed = True
                    with st.spinner("Executing solution on test cases..."):
                        for idx, test_case in enumerate(test_cases):
                            actual_output = execute_code(language, code, test_case)
                            passed = normalize_output(actual_output) == normalize_output(test_case['output'])
                            st.session_state['test_case_results'][idx] = {
                                "output": actual_output,
                                "passed": passed
                            }
                            if not passed:
                                all_passed = False

                    if test_cases and all_passed:
                        end_time = datetime.now()
                        time_taken_seconds = (end_time - st.session_state['start_time']).total_seconds()
                        formatted_time_taken = format_time(time_taken_seconds)

                        st.success(f"🎉 All test cases passed in {formatted_time_taken}!")

                        difficulty = question_data.iloc[0].get('difficulty', 'Unknown')
                        topics = question_data.iloc[0].get('topics', [])
                        cleaned_topics = topics if isinstance(topics, list) else []

                        store_submission_data(
                            username, selected_qid, difficulty, cleaned_topics, language, formatted_time_taken,
                            code, sum(1 for result in st.session_state['test_case_results'].values() if result['passed']),
                            len(test_cases)
                        )
                        st.balloons()
                    elif test_cases:
                        st.error("Some test cases failed. Check details below.")
                        failed_end_time = datetime.now()
                        failed_time = format_time((failed_end_time - st.session_state['start_time']).total_seconds())
                        difficulty = question_data.iloc[0].get('difficulty', 'Unknown')
                        topics = question_data.iloc[0].get('topics', [])
                        cleaned_topics = topics if isinstance(topics, list) else []
                        store_submission_data(
                            username, selected_qid, difficulty, cleaned_topics, language, failed_time,
                            code, sum(1 for result in st.session_state['test_case_results'].values() if result['passed']),
                            len(test_cases)
                        )

                st.write("---")
                if st.button("Complete DSA Round", type="secondary", use_container_width=True, disabled=dsa_submitted):
                    try:
                        finalize_dsa_session(username, "manual")
                        st.success("DSA round submitted. Eligibility will be recalculated from the server records.")
                    except Exception as error:
                        st.error(f"Unable to complete the DSA round: {error}")

                # Render Tabbed Test Case Output
                if test_cases:
                    st.subheader("Test Case Details & Execution")
                    tabs = st.tabs([f"Test Case {i + 1}" for i in range(len(test_cases))])

                    for idx, tab in enumerate(tabs):
                        with tab:
                            tc = test_cases[idx]
                            st.write(f"**Input:** `{tc['input']}`")
                            st.write(f"**Expected Output:** `{tc['output']}`")

                            res = st.session_state['test_case_results'].get(idx)
                            if res:
                                st.write(f"**Actual Output:** `{res['output']}`")
                                if res['passed']:
                                    st.success(f"Test Case {idx + 1} Passed ✅")
                                else:
                                    st.error(f"Test Case {idx + 1} Failed ❌")

                            if st.button(f"Run Test Case {idx + 1} Only", key=f"single_run_{idx}", disabled=dsa_submitted):
                                if start_dsa_session(username).get("dsa", {}).get("submitted") is True:
                                    st.error("The DSA assessment has expired or was already submitted.")
                                    st.stop()
                                with st.spinner(f"Executing Test Case {idx + 1}..."):
                                    single_out = execute_code(language, code, tc)
                                    is_pass = normalize_output(single_out) == normalize_output(tc['output'])
                                    st.session_state['test_case_results'][idx] = {
                                        "output": single_out,
                                        "passed": is_pass
                                    }
                                st.rerun()

        else:
            st.warning(f"Question with QID {selected_qid} not found.")

    # --------------------------------------
    # Main Questions Table & Filtering View
    # --------------------------------------
    else:
        if not questions_df.empty and "difficulty" in questions_df.columns:
            difficulty_level = st.selectbox(
                "Filter by Difficulty",
                options=[""] + list(questions_df["difficulty"].dropna().unique())
            )

            all_topics = [
                topic
                for topics_list in questions_df["topics"]
                if isinstance(topics_list, list)
                for topic in topics_list
            ]
            unique_topics = [""] + sorted(set(all_topics))

            selected_topic = st.selectbox("Filter by Topic", options=unique_topics)

            # Safe filtering pipeline
            if "isPaidOnly" in questions_df.columns:
                filtered_questions = questions_df[questions_df["isPaidOnly"] == False]
            else:
                filtered_questions = questions_df.copy()

            if difficulty_level:
                filtered_questions = filtered_questions[filtered_questions["difficulty"] == difficulty_level]

            if selected_topic:
                filtered_questions = filtered_questions[
                    filtered_questions["topics"].apply(
                        lambda topics: selected_topic in topics if isinstance(topics, list) else False
                    )
                ]

            if filtered_questions.empty:
                st.warning("No questions match the selected criteria. Please adjust your filters.")
            else:
                header_cols = st.columns([1, 1, 3, 1, 2, 1, 1, 1])
                headers = ["Index", "QID", "Title", "Difficulty", "Topics", "Status", "Time Taken", "Action"]
                for h_col, h_text in zip(header_cols, headers):
                    with h_col:
                        st.markdown(f"<b style='color: #1f77b4;'>{h_text}</b>", unsafe_allow_html=True)
                st.write("---")

                for idx, row in enumerate(filtered_questions.itertuples(), 1):
                    col1, col2, col3, col4, col5, col6, col7, col8 = st.columns([1, 1, 3, 1, 2, 1, 1, 1])

                    qid = getattr(row, 'QID', None)
                    submission_info = st.session_state.get('submissions', {}).get(
                        qid, {"status": "Pending", "time_taken": "N/A"}
                    )

                    with col1:
                        st.write(f"**{idx}**")
                    with col2:
                        st.write(f"**{qid}**")
                    with col3:
                        st.write(getattr(row, 'title', ''))
                    with col4:
                        st.write(getattr(row, 'difficulty', ''))
                    with col5:
                        topics_val = getattr(row, 'topics', [])
                        topics_str = ", ".join(sorted(topics_val)) if isinstance(topics_val, list) else ""
                        st.write(topics_str)
                    with col6:
                        st.write(submission_info["status"])
                    with col7:
                        st.write(submission_info["time_taken"])
                    with col8:
                        next_url = f"/dsa/?qid={qid}"
                        st.markdown(f"[Solve (QID {qid})]({next_url})")
        else:
            st.info("No questions database (`question_details.csv`) loaded yet.")