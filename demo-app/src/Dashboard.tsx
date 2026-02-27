import React from 'react';
import ReactDOM from 'react-dom';

// Dashboard component that uses ReactDOM.render for portal mounting
// This pattern is common in apps with modal dialogs and tooltips

interface DashboardProps {
    title: string;
    widgets: string[];
}

export class Dashboard extends React.Component<DashboardProps> {
    private modalContainer: HTMLDivElement | null = null;

    componentDidMount() {
        this.modalContainer = document.createElement('div');
        document.body.appendChild(this.modalContainer);
        this.renderModal();
    }

    componentDidUpdate() {
        this.renderModal();
    }

    componentWillUnmount() {
        if (this.modalContainer) {
            // unmountComponentAtNode removed in React 19
            ReactDOM.unmountComponentAtNode(this.modalContainer);
            document.body.removeChild(this.modalContainer);
        }
    }

    renderModal() {
        if (this.modalContainer) {
            // ReactDOM.render into a portal container — removed in React 19
            ReactDOM.render(
                <div className="modal-overlay">
                    <p>Modal for {this.props.title}</p>
                </div>,
                this.modalContainer
            );
        }
    }

    render() {
        return (
            <div className="dashboard">
                <h1>{this.props.title}</h1>
                <div className="widget-grid">
                    {this.props.widgets.map((w, i) => (
                        <div key={i} className="widget-card">{w}</div>
                    ))}
                </div>
            </div>
        );
    }
}
