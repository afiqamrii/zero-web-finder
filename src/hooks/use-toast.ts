export function useToast() {
  return {
    toast: (props: { title: string, description?: string, variant?: string }) => {
      alert(`${props.title}\n${props.description || ''}`);
    }
  }
}
