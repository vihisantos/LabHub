import { ApprovalScreen } from '../Approval/ApprovalScreen'

interface SignupStatusScreenProps {
  status: 'waiting' | 'approved' | 'rejected'
  secondsLeft?: number
  totalSeconds?: number
  onEnter: () => void
  onRetry: () => void
  requiresLogin?: boolean
  email?: string
}

/** Keep the signup flow and the dedicated approval route visually consistent. */
export function SignupStatusScreen(props: SignupStatusScreenProps) {
  return <ApprovalScreen {...props} />
}
