import { ApiError } from "./errors";

export type TeacherVerificationDelivery = {
  previewUrl: string | null;
  sent: boolean;
};

export async function sendTeacherVerificationEmail(input: {
  email: string;
  firstName: string;
  verifyUrl: string;
}): Promise<TeacherVerificationDelivery> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;

  if (!resendApiKey || !emailFrom) {
    console.info(`Teacher verification preview for ${input.email}: ${input.verifyUrl}`);
    return {
      sent: false,
      previewUrl: input.verifyUrl,
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [input.email],
      subject: "Confirm your Lingua Flow teacher account",
      html: `
        <p>Hi ${input.firstName},</p>
        <p>Confirm your email to activate your teacher account:</p>
        <p><a href="${input.verifyUrl}">${input.verifyUrl}</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    }),
  });

  if (!response.ok) {
    throw new ApiError(502, "Could not send the confirmation email.");
  }

  return {
    sent: true,
    previewUrl: null,
  };
}
