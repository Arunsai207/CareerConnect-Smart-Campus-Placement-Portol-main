require("dotenv").config();
const nodemailer = require("nodemailer");

async function testSMTP() {
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE === "true",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });

        console.log("Checking SMTP connection...");

        await transporter.verify();

        console.log("✅ SMTP connection successful!");
        console.log("✅ Gmail authentication successful!");
        console.log("✅ CareerConnect email configuration is working.");
    } catch (error) {
        console.error("❌ SMTP test failed.");
        console.error("Error:", error.message);
    }
}

testSMTP();