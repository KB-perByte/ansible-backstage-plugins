import { SignInPage } from './SignInPage';
import { screen, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { rhAapAuthApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';

jest.mock('@backstage/core-components', () => ({
  SignInPage: jest.fn(props => (
    <div data-testid="mock-signin-page">
      <div>Title: {props.title}</div>
      <div>
        {props.providers.map((p: any, i: number) => (
          <span key={i} data-testid={`provider-${typeof p === 'string' ? p : p.id}`}>
            {typeof p === 'string' ? p : p.title}
          </span>
        ))}
      </div>
    </div>
  )),
  ProxiedSignInPage: jest.fn(props => (
    <div data-testid="mock-proxied-signin">Provider: {props.provider}</div>
  )),
}));

describe('SignInPage', () => {
  const mockOnSignInSuccess = jest.fn();
  const render = (children: JSX.Element) =>
    renderInTestApp(
      <TestApiProvider apis={[[rhAapAuthApiRef, {}]]}>
        <>{children}</>
      </TestApiProvider>,
      { mountedRoutes: { '/self-service': rootRouteRef } },
    );

  beforeEach(() => jest.clearAllMocks());

  it('shows ProxiedSignInPage with local-admin during setup', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ data: { localAdminEnabled: true } }),
    });
    await render(<SignInPage onSignInSuccess={mockOnSignInSuccess} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-proxied-signin')).toBeInTheDocument();
    });
    expect(screen.getByText('Provider: local-admin')).toBeInTheDocument();
  });

  it('shows AAP OAuth after setup complete', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ data: { localAdminEnabled: false } }),
    });
    await render(<SignInPage onSignInSuccess={mockOnSignInSuccess} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-signin-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('provider-rhaap')).toBeInTheDocument();
  });

  it('defaults to setup mode when backend unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network'));
    await render(<SignInPage onSignInSuccess={mockOnSignInSuccess} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-proxied-signin')).toBeInTheDocument();
    });
  });
});
