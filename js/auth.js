// Admin login authentication logic (Arabic)

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const errorBanner = document.getElementById("login-error");
  const errorMessage = document.getElementById("error-message");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      // Hide previous errors
      errorBanner.style.display = "none";

      try {
        // Run signInWithEmailAndPassword from window.auth
        const userCredential = await window.auth.signInWithEmailAndPassword(email, password);
        console.log("Logged in successfully:", userCredential.user);
        
        // Redirect to admin index
        window.location.href = `${window.BASE_PATH || ''}/admin/index.html`;
      } catch (error) {
        console.error("Login failed:", error);
        errorMessage.textContent = "فشل تسجيل الدخول: يرجى التحقق من صحة البريد الإلكتروني وكلمة المرور.";
        errorBanner.style.display = "block";
      }
    });
  }
});
