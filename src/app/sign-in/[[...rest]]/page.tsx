import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex justify-center py-16">
      <SignIn
        appearance={{
          elements: {
            rootBox: 'mx-auto',
          },
        }}
        signUpUrl="/sign-up"
      />
    </div>
  );
}
