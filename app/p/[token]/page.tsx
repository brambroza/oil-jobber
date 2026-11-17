/**
 * Short alias of the customer slip page: /p/<token> renders the same page as /pay/<token>.
 * Payment links sent to LINE use this shorter path.
 */
export { default } from '../../pay/[token]/page';
